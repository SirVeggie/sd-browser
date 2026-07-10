import { v4 as uuidv4 } from 'uuid';
import type { ServerImage } from '$lib/types/images';
import type { SortingMethod } from '$lib/types/misc';
import type { StreamRequest } from '$lib/types/requests';
import { getImage } from './dataIndex';
import { getPositiveSimilarSourceIds, pinIdsToFront } from '$lib/tools/searchParsing';
import type { ImgSearchContext } from './searching';
import { sortImages } from './searching';

export const imageLimit = 1000;
export const sessionReconnectGraceMs = 10 * 60 * 1000;

export type SearchSession = {
    queryKey: string;
    query: SessionQuery;
    sorting: SortingMethod;
    orderedIds: string[];
    /** Stable initial pool order; random sessions must never be reshuffled. */
    sourceOrder: string[];
    sourcePositions: Map<string, number>;
    /** Images temporarily omitted from this session by quick tag. */
    excludedIds: Set<string>;
    viewIds: Set<string>;
    timestamp: number;
    complete?: boolean;
    imgSearchContext?: ImgSearchContext;
    imgSearchError?: string;
};

type SessionQuery = Pick<
    StreamRequest,
    | 'search'
    | 'matching'
    | 'sorting'
    | 'explorationMode'
    | 'sparseFrequency'
    | 'similarityAlgorithm'
    | 'similarityThreshold'
>;

const sessions = new Map<string, SearchSession>();
const sessionExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activeStreamCounts = new Map<string, number>();

export function buildQueryKey(query: SessionQuery): string {
    return JSON.stringify({
        search: query.search,
        matching: query.matching,
        sorting: query.sorting,
        explorationMode: query.explorationMode,
        sparseFrequency: query.sparseFrequency,
        similarityAlgorithm: query.similarityAlgorithm,
        similarityThreshold: query.similarityThreshold,
    });
}

function resolveImages(ids: string[]): ServerImage[] {
    const images: ServerImage[] = [];
    for (const id of ids) {
        const image = getImage(id);
        if (image) images.push(image);
    }
    return images;
}

export function sliceImages(
    images: ServerImage[],
    sorting: SortingMethod,
    latestId?: string,
    oldestId?: string,
): ServerImage[] {
    const firstIndex = !latestId ? undefined : images.findIndex((i) => i.id === latestId);
    const lastIndex = !oldestId ? undefined : images.findIndex((i) => i.id === oldestId);

    if (firstIndex === -1 || lastIndex === -1) {
        throw new Error('Invalid request: image id not found');
    }

    if (firstIndex != undefined || lastIndex != undefined) {
        let result = images.slice(0, firstIndex ?? 0);
        if (lastIndex != undefined) {
            result.push(...images.slice(lastIndex + 1, lastIndex + 1 + (imageLimit - result.length)));
        }
        return result;
    }

    return images.slice(0, imageLimit);
}

export function createSessionStub(query: SessionQuery): {
    sessionId: string;
    timestamp: number;
} {
    const sessionId = uuidv4();
    const timestamp = Date.now();
    sessions.set(sessionId, {
        queryKey: buildQueryKey(query),
        query,
        sorting: query.sorting,
        orderedIds: [],
        sourceOrder: [],
        sourcePositions: new Map(),
        excludedIds: new Set(),
        viewIds: new Set(),
        timestamp,
    });
    return { sessionId, timestamp };
}

export function appendSessionChunk(sessionId: string, ids: string[]): void {
    const session = sessions.get(sessionId);
    if (!session) return;

    if (ids.length === 1) {
        session.orderedIds.push(ids[0]);
    } else if (ids.length > 1) {
        session.orderedIds = session.orderedIds.concat(ids);
    }

    for (const id of ids) {
        session.viewIds.add(id);
    }
}

export function finalizeSession(sessionId: string, orderedIds: string[], sourceOrder: string[]): void {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.orderedIds = orderedIds;
    session.sourceOrder = sourceOrder;
    session.sourcePositions = new Map(
        sourceOrder.map((id, index) => [id, index]),
    );
    session.complete = true;
}

export function getSession(sessionId: string): SearchSession | undefined {
    return sessions.get(sessionId);
}

export function validateSession(sessionId: string, query: SessionQuery): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;
    return session.queryKey === buildQueryKey(query);
}

/**
 * Reattaches a completed session to a new stream during its reconnect grace period.
 */
export function resumeSession(
    sessionId: string,
    query: SessionQuery,
): SearchSession | undefined {
    const session = sessions.get(sessionId);
    if (!session || !session.complete || session.queryKey !== buildQueryKey(query)) {
        return undefined;
    }

    cancelSessionExpiry(sessionId);
    return session;
}

export function attachSessionStream(sessionId: string): void {
    if (!sessions.has(sessionId)) return;
    cancelSessionExpiry(sessionId);
    activeStreamCounts.set(sessionId, (activeStreamCounts.get(sessionId) ?? 0) + 1);
}

export function detachSessionStream(sessionId: string): void {
    const activeStreams = activeStreamCounts.get(sessionId) ?? 0;
    if (activeStreams > 1) {
        activeStreamCounts.set(sessionId, activeStreams - 1);
        return;
    }

    activeStreamCounts.delete(sessionId);
    scheduleSessionExpiry(sessionId);
}

export function sliceSession(
    sessionId: string,
    latestId: string,
    oldestId: string,
): ServerImage[] {
    const session = sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    const images = resolveImages(session.orderedIds);
    return sliceImages(images, session.sorting, latestId || undefined, oldestId || undefined);
}

export function patchSession(
    sessionId: string,
    additions: string[],
    deletions: string[],
): void {
    const session = sessions.get(sessionId);
    if (!session) return;

    const deleteSet = new Set(deletions);
    let ids = session.orderedIds.filter((id) => !deleteSet.has(id));

    if (additions.length) {
        const additionSet = new Set(additions);
        ids = ids.filter((id) => !additionSet.has(id));
        ids = sortSessionIds([...ids, ...additions], session);
    }

    session.orderedIds = ids;

    for (const id of deletions) {
        session.viewIds.delete(id);
    }
    for (const id of additions) {
        session.viewIds.add(id);
    }
}

export function replaceSessionResults(
    sessionId: string,
    orderedIds: string[],
): void {
    const session = sessions.get(sessionId);
    if (!session) return;

    session.orderedIds = orderedIds;
    session.viewIds = new Set(orderedIds);
}

export function setSessionExcluded(
    sessionId: string,
    ids: string[],
    excluded: boolean,
): SearchSession | undefined {
    const session = sessions.get(sessionId);
    if (!session) return undefined;

    for (const id of ids) {
        if (excluded) session.excludedIds.add(id);
        else session.excludedIds.delete(id);
    }
    return session;
}

export function sortSessionIds(ids: string[], session: SearchSession): string[] {
    let sorted: string[];

    if (session.sorting === 'random' && session.sourceOrder.length) {
        const positions = new Map(session.sourceOrder.map((id, index) => [id, index]));
        sorted = [...ids].sort((a, b) => {
            const positionA = positions.get(a) ?? Number.POSITIVE_INFINITY;
            const positionB = positions.get(b) ?? Number.POSITIVE_INFINITY;
            return positionA - positionB;
        });
    } else {
        const matchScores = session.imgSearchContext?.matchScores;
        if (
            matchScores?.size
            && (session.sorting === 'similar' || session.sorting === 'similar (inverse)')
        ) {
            sorted = [...ids].sort((a, b) => {
                const scoreA = matchScores.get(a);
                const scoreB = matchScores.get(b);
                if (scoreA !== undefined && scoreB !== undefined)
                    return session.sorting === 'similar'
                        ? scoreB - scoreA
                        : scoreA - scoreB;
                if (scoreA !== undefined)
                    return -1;
                if (scoreB !== undefined)
                    return 1;
                return 0;
            });
        } else {
            sorted = sortImages(resolveImages(ids), session.sorting).map((image) => image.id);
        }
    }

    if (session.sorting === 'similar' || session.sorting === 'similar (inverse)')
        return sorted;

    return pinIdsToFront(sorted, getPositiveSimilarSourceIds(session.query.search));
}

export function trackSessionViewIds(sessionId: string, ids: string[]): void {
    const session = sessions.get(sessionId);
    if (!session) return;
    for (const id of ids) {
        session.viewIds.add(id);
    }
}

export function setSessionImgSearchContext(sessionId: string, imgSearchContext: ImgSearchContext | undefined): void {
    const session = sessions.get(sessionId);
    if (session) {
        session.imgSearchContext = imgSearchContext;
        session.imgSearchError = imgSearchContext?.error;
    }
}

export function getSessionImgSearchError(session: SearchSession | undefined): string | undefined {
    return session?.imgSearchContext?.error ?? session?.imgSearchError;
}

export function deleteSession(sessionId: string): void {
    cancelSessionExpiry(sessionId);
    activeStreamCounts.delete(sessionId);
    sessions.delete(sessionId);
}

/**
 * Keeps a completed session available briefly after its stream disconnects.
 */
export function scheduleSessionExpiry(
    sessionId: string,
    graceMs = sessionReconnectGraceMs,
): void {
    const session = sessions.get(sessionId);
    if (!session?.complete) {
        deleteSession(sessionId);
        return;
    }

    cancelSessionExpiry(sessionId);
    const timer = setTimeout(() => {
        sessionExpiryTimers.delete(sessionId);
        sessions.delete(sessionId);
    }, graceMs);
    sessionExpiryTimers.set(sessionId, timer);
}

function cancelSessionExpiry(sessionId: string): void {
    const timer = sessionExpiryTimers.get(sessionId);
    if (timer === undefined) return;
    clearTimeout(timer);
    sessionExpiryTimers.delete(sessionId);
}
