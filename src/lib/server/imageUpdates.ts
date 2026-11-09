import { getDeletedImageIds, getFreshImageTimestamp, getFreshImages, getImage } from './dataIndex';
import {
    buildMatcher,
    buildSearchPlan,
    collectSearchPlanImages,
    explorationFromRequest,
    formatSearchFailureMessage,
    getResultWindow,
    logSearchFailure,
} from './searching';
import { stripResultShapingParts } from '$lib/tools/searchParsing';
import { mapServerImageToClient } from '$lib/tools/misc';
import type { ServerImage } from '$lib/types/images';
import type { UpdateRequest, UpdateResponse } from '$lib/types/requests';
import { sessionIdComparator, sortSessionIds, type SearchSession } from './searchSessions';

export type ImageUpdateResult = UpdateResponse | { error: string; status?: number };

export type ImageUpdateOptions = {
    /**
     * Only look at images added, changed or deleted since `query.timestamp`, instead of
     * re-matching and re-sorting the whole session. Updates the session's order in place
     * and returns insert anchors instead of the full order. Falls back to the full
     * recompute when the session's order can't be patched.
     */
    incremental?: boolean;
};

const sessionIdSets = new WeakMap<string[], Set<string>>();

function getSessionIdSet(session: SearchSession): Set<string> {
    let ids = sessionIdSets.get(session.orderedIds);
    if (!ids || ids.size !== session.orderedIds.length) {
        ids = new Set(session.orderedIds);
        sessionIdSets.set(session.orderedIds, ids);
    }
    return ids;
}

/** First index whose id sorts after `id`, so equal ids keep their earlier place. */
function upperBound(ids: string[], id: string, compare: (a: string, b: string) => number): number {
    let low = 0;
    let high = ids.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (compare(id, ids[middle]) < 0)
            high = middle;
        else
            low = middle + 1;
    }
    return low;
}

function latestFreshTimestamp(sinceTimestamp: number): number {
    return getFreshImages(sinceTimestamp).reduce((latest, image) => {
        return Math.max(latest, getFreshImageTimestamp(image.id) ?? latest);
    }, sinceTimestamp);
}

function computeIncrementalSessionUpdate(
    session: SearchSession,
    query: UpdateRequest,
    exploration: ReturnType<typeof explorationFromRequest>,
): UpdateResponse | undefined {
    if (session.mmrSearchContext || session.pruneSearchContext)
        return undefined;
    if (getResultWindow(query.search).take !== 0)
        return undefined;
    const compare = sessionIdComparator(session);
    if (!compare)
        return undefined;

    const freshImages = getFreshImages(query.timestamp);
    const deletedIds = getDeletedImageIds(query.timestamp);
    const timestamp = latestFreshTimestamp(query.timestamp);
    if (!freshImages.length && !deletedIds.length)
        return { additions: [], deletions: [], timestamp };

    const inSession = getSessionIdSet(session);
    const removals = new Set<string>();
    for (const id of deletedIds) {
        if (inSession.has(id) && !getImage(id))
            removals.add(id);
    }

    const matcher = buildMatcher(
        stripResultShapingParts(query.search),
        query.matching,
        exploration,
        session.imgSearchContext,
    );
    const added: ServerImage[] = [];
    const addedIds = new Set<string>();
    for (const image of freshImages) {
        if (!inSession.has(image.id) && !session.sourcePositions.has(image.id)) {
            session.sourcePositions.set(image.id, session.sourceOrder.length);
            session.sourceOrder.push(image.id);
        }
        const matches = !session.excludedIds.has(image.id) && matcher(image);
        if (inSession.has(image.id)) {
            if (!matches)
                removals.add(image.id);
        } else if (matches && !addedIds.has(image.id)) {
            added.push(image);
            addedIds.add(image.id);
        }
    }

    if (!removals.size && !added.length)
        return { additions: [], deletions: [], timestamp };

    const ids = removals.size
        ? session.orderedIds.filter((id) => !removals.has(id))
        : [...session.orderedIds];
    for (const image of added)
        ids.splice(upperBound(ids, image.id, compare), 0, image.id);

    // Each addition goes before the next id the client already has (null: at the end).
    // Additions are sent in their final order, so several with one anchor stay in order.
    const anchors: Record<string, string | null> = {};
    const orderedAdded: ServerImage[] = [];
    let waiting: string[] = [];
    for (const id of ids) {
        if (addedIds.has(id)) {
            waiting.push(id);
            orderedAdded.push(getImage(id)!);
            continue;
        }
        if (!waiting.length)
            continue;
        for (const waitingId of waiting)
            anchors[waitingId] = id;
        waiting = [];
        if (orderedAdded.length === addedIds.size)
            break;
    }
    for (const waitingId of waiting)
        anchors[waitingId] = null;

    for (const id of removals)
        inSession.delete(id);
    for (const id of addedIds)
        inSession.add(id);
    session.orderedIds = ids;
    sessionIdSets.set(ids, inSession);

    return {
        additions: mapServerImageToClient(orderedAdded),
        deletions: [...removals],
        anchors,
        timestamp,
    };
}

function getSessionResultImages(
    session: SearchSession,
    query: UpdateRequest,
    exploration: ReturnType<typeof explorationFromRequest>,
): ServerImage[] {
    const { take } = getResultWindow(query.search);
    const matcherSearch = stripResultShapingParts(query.search);
    const matcher = buildMatcher(
        matcherSearch,
        query.matching,
        exploration,
        session.imgSearchContext,
    );
    const maxResults = take || Number.POSITIVE_INFINITY;
    const isFixedResultSession = session.mmrSearchContext !== undefined
        || session.pruneSearchContext !== undefined;
    const existingIds = new Set(session.orderedIds);
    const freshImages = getFreshImages(query.timestamp);
    const sourceOrder = session.sourceOrder;

    if (!isFixedResultSession) {
        for (const image of freshImages) {
            if (existingIds.has(image.id) || session.sourcePositions.has(image.id)) continue;
            session.sourcePositions.set(image.id, session.sourceOrder.length);
            session.sourceOrder.push(image.id);
        }
    }

    let results = session.orderedIds.filter((id) => {
        if (session.excludedIds.has(id)) return false;
        const image = getImage(id);
        return image !== undefined && matcher(image);
    });

    if (!isFixedResultSession) {
        for (const image of freshImages) {
            if (session.excludedIds.has(image.id) || !matcher(image)) continue;
            if (!results.includes(image.id)) results.push(image.id);
        }
    }

    results = sortSessionIds(results, session);
    if (isFixedResultSession) {
        return results
            .map((id) => getImage(id))
            .filter((image): image is ServerImage => image !== undefined);
    }

    if (take === 0) {
        return results
            .map((id) => getImage(id))
            .filter((image): image is ServerImage => image !== undefined);
    }
    results.length = Math.min(results.length, maxResults);

    const resultIds = new Set(results);
    const tailId = results.at(-1);
    const startIndex = tailId === undefined
        ? 0
        : (session.sourcePositions.get(tailId) ?? -1) + 1;

    for (let index = startIndex; index < sourceOrder.length && results.length < maxResults; index++) {
        const id = sourceOrder[index];
        if (resultIds.has(id) || session.excludedIds.has(id)) continue;
        const image = getImage(id);
        if (!image || !matcher(image)) continue;
        results.push(id);
        resultIds.add(id);
    }

    return sortSessionIds(results, session)
        .map((id) => getImage(id))
        .filter((image): image is ServerImage => image !== undefined);
}

function getMetadataMembershipDeletions(
    currentIds: readonly string[],
    sinceTimestamp: number,
    matcher: (image: ServerImage) => boolean,
): string[] {
    const freshImages = getFreshImages(sinceTimestamp);
    if (!freshImages.length) return [];

    const freshIdSet = new Set(freshImages.map((image) => image.id));

    const deletions: string[] = [];
    for (const id of currentIds) {
        if (!freshIdSet.has(id)) continue;
        const image = getImage(id);
        if (!image || !matcher(image)) {
            deletions.push(id);
        }
    }
    return deletions;
}

export async function computeImageUpdate(
    query: UpdateRequest,
    session?: SearchSession,
    options: ImageUpdateOptions = {},
): Promise<ImageUpdateResult> {
    let images: ServerImage[] = [];
    let resultIds: Set<string>;

    try {
        const exploration = explorationFromRequest(query);
        if (session && options.incremental) {
            const incremental = computeIncrementalSessionUpdate(session, query, exploration);
            if (incremental)
                return incremental;
        }
        if (session) {
            const desired = getSessionResultImages(session, query, exploration);
            const desiredIds = new Set(desired.map((image) => image.id));
            const resultIds = new Set(session.orderedIds);
            const images = desired.filter((image) => !resultIds.has(image.id));
            const deletions = session.orderedIds.filter((id) => !desiredIds.has(id));
            const timestamp = latestFreshTimestamp(query.timestamp);

            return {
                additions: mapServerImageToClient(images),
                deletions,
                orderedIds: desired.map((image) => image.id),
                timestamp,
            };
        }
        const plan = await buildSearchPlan(
            query.search,
            query.matching,
            exploration,
            query.sorting,
            undefined,
        );

        if (!session) {
            const limited = collectSearchPlanImages(plan);
            resultIds = new Set(limited.map((image) => image.id));
        }

        images = collectSearchPlanImages(plan, { timestamp: query.timestamp });

        const metadataDeletions = getMetadataMembershipDeletions(
            query.currentIds,
            query.timestamp,
            plan.matcher,
        );
        const staleIds = query.currentIds.filter((id) => !resultIds.has(id));
        const deletions = [...new Set([
            ...getDeletedImageIds(query.timestamp),
            ...staleIds,
            ...metadataDeletions,
        ])];
        const timestamp = images.reduce((latest, image) => {
            return Math.max(latest, getFreshImageTimestamp(image.id) ?? latest);
        }, query.timestamp);

        return {
            additions: mapServerImageToClient(images),
            deletions,
            timestamp,
        };
    } catch (e) {
        logSearchFailure(e);
        return { error: formatSearchFailureMessage(e), status: e instanceof Error ? 200 : 400 };
    }
}

export function hasUpdateChanges(res: UpdateResponse, currentIds: Set<string>): boolean {
    if (res.additions.length) return true;
    if (!res.deletions.length) return false;
    return res.deletions.some((id) => currentIds.has(id));
}
