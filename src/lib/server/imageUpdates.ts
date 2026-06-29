import { getDeletedImageIds, getFreshImageTimestamp } from './filemanager';
import { applyResultSkip, applyResultTake, explorationFromRequest, searchImages } from './searching';
import { mapServerImageToClient } from '$lib/tools/misc';
import type { ServerImage } from '$lib/types/images';
import type { UpdateRequest, UpdateResponse } from '$lib/types/requests';
import type { SearchSession } from './searchSessions';

export type ImageUpdateResult = UpdateResponse | { error: string; status?: number };

export function computeImageUpdate(
    query: UpdateRequest,
    session?: SearchSession,
): ImageUpdateResult {
    let images: ServerImage[] = [];
    let resultIds: Set<string>;

    try {
        const exploration = explorationFromRequest(query);

        if (session) {
            resultIds = new Set(session.orderedIds);
        } else {
            const currentResult = searchImages(
                query.search,
                query.filters,
                query.matching,
                exploration,
                { sorting: query.sorting, skipResults: false, takeResults: false },
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
    const deletions = [...new Set([...getDeletedImageIds(query.timestamp), ...staleIds])];
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
