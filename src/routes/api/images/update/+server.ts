import { invalidAuth } from '$lib/server/auth';
import { getDeletedImageIds, getFreshImageTimestamp, searchImages, sortImages } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses';
import { isUpdateRequest, type UpdateResponse } from '$lib/types';

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

    let images = searchImages(query.search, query.filters, query.matching, query.collapse, query.timestamp);
    images = sortImages(images, 'date');
    const timestamp = getFreshImageTimestamp(images[0]?.id) ?? query.timestamp;

    return success({
        additions: images.map(x => x.id),
        deletions: getDeletedImageIds(query.timestamp),
        timestamp,
    } satisfies UpdateResponse);
}