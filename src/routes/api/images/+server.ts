import { invalidAuth } from '$lib/server/auth.js';
import { searchImages, sortImages } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';
import { isImageRequest, type ImageResponse } from '$lib/types.js';

const imageLimit = 1000;

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query = await e.request.json();
    if (!isImageRequest(query))
        return error('Invalid request', 400);

    let images = searchImages(query.search, query.filters, query.matching, query.collapse);
    images = sortImages(images, query.sorting);

    const firstIndex = !query.latestId ? 0 : images.findIndex(i => i.id === query.latestId);
    const lastIndex = !query.oldestId ? 0 : images.findIndex(i => i.id === query.oldestId);

    const result = images.slice(0, firstIndex);
    if (lastIndex) {
        result.push(...images.slice(lastIndex, lastIndex + (imageLimit - result.length)));
    }

    return success({
        imageIds: images.map(x => x.id),
        amount: images.length,
    } satisfies ImageResponse);
}