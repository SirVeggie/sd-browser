import { v4 as uuidv4 } from 'uuid';
import type { ServerImage } from '$lib/types/images';
import type { SortingMethod } from '$lib/types/misc';
import type { ImageRequest } from '$lib/types/requests';
import { getImage } from './filemanager';
import { applyResultSkip, explorationFromRequest, searchImages, sortImages } from './searching';
import { mapServerImageToClient } from '$lib/tools/misc';

export const imageLimit = 1000;

export type SearchSession = {
    queryKey: string;
    sorting: SortingMethod;
    orderedIds: string[];
    viewIds: Set<string>;
    timestamp: number;
};

type SessionQuery = Pick<
    ImageRequest,
    | 'search'
    | 'filters'
    | 'matching'
    | 'sorting'
    | 'explorationMode'
    | 'sparseFrequency'
    | 'similarityAlgorithm'
    | 'similarityThreshold'
    | 'nsfw'
>;

const sessions = new Map<string, SearchSession>();

export function buildQueryKey(query: SessionQuery): string {
    return JSON.stringify({
        search: query.search,
        filters: query.filters,
        matching: query.matching,
        sorting: query.sorting,
        explorationMode: query.explorationMode,
        sparseFrequency: query.sparseFrequency,
        similarityAlgorithm: query.similarityAlgorithm,
        similarityThreshold: query.similarityThreshold,
        nsfw: query.nsfw,
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

export function runSearch(query: SessionQuery): ServerImage[] {
    const exploration = explorationFromRequest(query);
    let images = searchImages(
        query.search,
        query.filters,
        query.matching,
        exploration,
        { sorting: query.sorting, skipResults: false },
    );
    return applyResultSkip(images, query.search);
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

    if (sorting !== 'random') {
        return images.slice(0, imageLimit);
    }

    return images;
}

export function createSession(query: SessionQuery): {
    sessionId: string;
    images: ReturnType<typeof mapServerImageToClient>;
    amount: number;
    timestamp: number;
} {
    const images = runSearch(query);
    const sessionId = uuidv4();
    const timestamp = Date.now();
    const page = sliceImages(images, query.sorting);
    const session: SearchSession = {
        queryKey: buildQueryKey(query),
        sorting: query.sorting,
        orderedIds: images.map((image) => image.id),
        viewIds: new Set(page.map((image) => image.id)),
        timestamp,
    };
    sessions.set(sessionId, session);

    return {
        sessionId,
        images: mapServerImageToClient(page),
        amount: images.length,
        timestamp,
    };
}

export function getSession(sessionId: string): SearchSession | undefined {
    return sessions.get(sessionId);
}

export function validateSession(sessionId: string, query: SessionQuery): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;
    return session.queryKey === buildQueryKey(query);
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
        const newImages = resolveImages(additions);
        const merged = sortImages([...resolveImages(ids), ...newImages], session.sorting);
        ids = merged.map((image) => image.id);
    }

    session.orderedIds = ids;

    for (const id of deletions) {
        session.viewIds.delete(id);
    }
    for (const id of additions) {
        session.viewIds.add(id);
    }
}

export function trackSessionViewIds(sessionId: string, ids: string[]): void {
    const session = sessions.get(sessionId);
    if (!session) return;
    for (const id of ids) {
        session.viewIds.add(id);
    }
}

export function deleteSession(sessionId: string): void {
    sessions.delete(sessionId);
}
