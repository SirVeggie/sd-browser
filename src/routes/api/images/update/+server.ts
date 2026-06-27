import { invalidAuth } from '$lib/server/auth';
import { getDeletedImageIds, getFreshImageTimestamp } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses';
import { applyResultSkip, searchImages, sortImages } from '$lib/server/searching';
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
    try {
        images = searchImages(query.search, query.filters, query.matching, query.collapse, query.timestamp, false);
        images = sortImages(images, 'date');
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
    const timestamp = getFreshImageTimestamp(images[0]?.id) ?? query.timestamp;

    return success({
        additions: mapServerImageToClient(images),
        deletions: getDeletedImageIds(query.timestamp),
        timestamp,
    } satisfies UpdateResponse);
}