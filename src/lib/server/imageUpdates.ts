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
import { mapServerImageToClient } from '$lib/tools/misc';
import type { ServerImage } from '$lib/types/images';
import type { UpdateRequest, UpdateResponse } from '$lib/types/requests';
import type { SearchSession } from './searchSessions';

export type ImageUpdateResult = UpdateResponse | { error: string; status?: number };

function getSessionResultImages(
    session: SearchSession,
    query: UpdateRequest,
    exploration: ReturnType<typeof explorationFromRequest>,
): ServerImage[] {
    const { take } = getResultWindow(query.search);
    const matcher = buildMatcher(
        query.search,
        query.matching,
        exploration,
        session.imgSearchContext,
    );
    const maxResults = take || Number.POSITIVE_INFINITY;
    const existingIds = new Set(session.orderedIds);
    const freshImages = getFreshImages(query.timestamp);
    const sourceOrder = session.sourceOrder;

    for (const image of freshImages) {
        if (existingIds.has(image.id) || session.sourcePositions.has(image.id)) continue;
        session.sourcePositions.set(image.id, session.sourceOrder.length);
        session.sourceOrder.push(image.id);
    }

    const results = session.orderedIds.filter((id) => {
        if (session.excludedIds.has(id)) return false;
        const image = getImage(id);
        return image !== undefined && matcher(image);
    });

    for (const image of freshImages) {
        if (session.excludedIds.has(image.id) || !matcher(image)) continue;
        if (!results.includes(image.id)) results.push(image.id);
    }

    results.sort((a, b) => {
        const positionA = session.sourcePositions.get(a) ?? Number.POSITIVE_INFINITY;
        const positionB = session.sourcePositions.get(b) ?? Number.POSITIVE_INFINITY;
        return positionA - positionB;
    });
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

    return results
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
): Promise<ImageUpdateResult> {
    let images: ServerImage[] = [];
    let resultIds: Set<string>;

    try {
        const exploration = explorationFromRequest(query);
        if (session) {
            const desired = getSessionResultImages(session, query, exploration);
            const desiredIds = new Set(desired.map((image) => image.id));
            const resultIds = new Set(session.orderedIds);
            const images = desired.filter((image) => !resultIds.has(image.id));
            const deletions = session.orderedIds.filter((id) => !desiredIds.has(id));
            const timestamp = getFreshImages(query.timestamp).reduce((latest, image) => {
                return Math.max(latest, getFreshImageTimestamp(image.id) ?? latest);
            }, query.timestamp);

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
