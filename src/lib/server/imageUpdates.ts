import { getDeletedImageIds, getFreshImageTimestamp, getFreshImages, getImage } from './dataIndex';
import { applyResultSkip, applyResultTake, buildMatcher, explorationFromRequest, resolveImgSearchContext, searchImages } from './searching';
import type { ImgSearchContext } from './searching';
import { mapServerImageToClient } from '$lib/tools/misc';
import type { ServerImage } from '$lib/types/images';
import type { UpdateRequest, UpdateResponse } from '$lib/types/requests';
import type { SearchSession } from './searchSessions';

export type ImageUpdateResult = UpdateResponse | { error: string; status?: number };

function getMetadataMembershipDeletions(
    query: UpdateRequest,
    currentIds: readonly string[],
    sinceTimestamp: number,
    imgSearchContext?: ImgSearchContext,
): string[] {
    const freshImages = getFreshImages(sinceTimestamp);
    if (!freshImages.length) return [];

    const freshIdSet = new Set(freshImages.map((image) => image.id));
    const exploration = explorationFromRequest(query);
    const matcher = buildMatcher(query.search, query.matching, exploration, imgSearchContext);
    const filter = buildMatcher(query.filters.join(' AND '), 'regex');

    const deletions: string[] = [];
    for (const id of currentIds) {
        if (!freshIdSet.has(id)) continue;
        const image = getImage(id);
        if (!image || !matcher(image) || !filter(image)) {
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
    let imgSearchContext: ImgSearchContext | undefined;

    try {
        const exploration = explorationFromRequest(query);
        imgSearchContext = session?.imgSearchContext
            ?? await resolveImgSearchContext(query.search);

        if (session) {
            resultIds = new Set(session.orderedIds);
        } else {
            const currentResult = searchImages(
                query.search,
                query.filters,
                query.matching,
                exploration,
                { sorting: query.sorting, skipResults: false, takeResults: false },
                imgSearchContext,
            );
            let limited = applyResultSkip(currentResult, query.search, query.sorting);
            limited = applyResultTake(limited, query.search, query.sorting);
            resultIds = new Set(limited.map((image) => image.id));
        }

        images = searchImages(
            query.search,
            query.filters,
            query.matching,
            exploration,
            { timestamp: query.timestamp, sorting: query.sorting, skipResults: false, takeResults: false },
            imgSearchContext,
        );
        images = applyResultSkip(images, query.search, query.sorting);
        images = applyResultTake(images, query.search, query.sorting);
    } catch (e) {
        if (e instanceof Error) {
            console.log(`${e.message}`);
            return { error: 'Malformed search string', status: 200 };
        }
        console.log(e);
        return { error: 'Malformed search string', status: 400 };
    }

    const staleIds = query.currentIds.filter((id) => !resultIds.has(id));
    const metadataDeletions = getMetadataMembershipDeletions(
        query,
        query.currentIds,
        query.timestamp,
        imgSearchContext,
    );
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
}

export function hasUpdateChanges(res: UpdateResponse, currentIds: Set<string>): boolean {
    if (res.additions.length) return true;
    if (!res.deletions.length) return false;
    return res.deletions.some((id) => currentIds.has(id));
}
