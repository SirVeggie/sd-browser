import { invalidAuth } from '$lib/server/auth';
import { getDeletedImageIds, getFreshImageTimestamp } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses';
import { applyResultSkip, explorationFromRequest, searchImages } from '$lib/server/searching';
import { mapServerImageToClient } from '$lib/tools/misc.js';
import type { ServerImage } from '$lib/types/images';
import { isUpdateRequest, type UpdateResponse } from '$lib/types/requests';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query = await e.request.json();
    if (!isUpdateRequest(query)) {
        return error('Invalid request body', 400);
    }

    if (!query.timestamp) {
        return error('Invalid request: timestamp required', 400);
    }

    let images: ServerImage[] = [];
    let resultIds = new Set<string>();
    try {
        const exploration = explorationFromRequest(query);
        const currentResult = searchImages(
            query.search,
            query.filters,
            query.matching,
            exploration,
            { sorting: query.sorting, skipResults: false },
        );
        resultIds = new Set(applyResultSkip(currentResult, query.search).map((image) => image.id));

        images = searchImages(
            query.search,
            query.filters,
            query.matching,
            exploration,
            { timestamp: query.timestamp, sorting: query.sorting, skipResults: false },
        );
        images = applyResultSkip(images, query.search);
    } catch (e) {
        if (e instanceof Error) {
            console.log(`${e.message}`);
            return error('Malformed search string', 200);
        } else {
            console.log(e);
            return error('Malformed search string', 400);
        }
    }

    const staleIds = query.currentIds.filter((id) => !resultIds.has(id));
    const deletions = [...new Set([...getDeletedImageIds(query.timestamp), ...staleIds])];
    const timestamp = images.reduce((latest, image) => {
        return Math.max(latest, getFreshImageTimestamp(image.id) ?? latest);
    }, query.timestamp);

    return success({
        additions: mapServerImageToClient(images),
        deletions,
        timestamp,
    } satisfies UpdateResponse);
}