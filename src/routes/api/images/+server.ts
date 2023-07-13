import { invalidAuth } from '$lib/server/auth.js';
import { getImage, searchImages, sortImages } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';
import { isImageRequest, type ImageResponse, type ServerImage } from '$lib/types.js';

const imageLimit = 100;

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query = await e.request.json();
    if (!isImageRequest(query))
        return error('Invalid request', 400);

    const timestamp = getImage(query.latestId)?.modifiedDate ?? 0;
    
    let images = searchImages(query.search, query.filters, query.matching, query.collapse, timestamp);
    images = sortImages(images, query.sorting);

    const firstIndex = !query.latestId ? undefined : images.findIndex(i => i.id === query.latestId);
    const lastIndex = !query.oldestId ? undefined : images.findIndex(i => i.id === query.oldestId);

    if (firstIndex === -1 || lastIndex === -1) {
        return error('Invalid request', 400);
    }

    let result: ServerImage[] = [];
    if (firstIndex != undefined || lastIndex != undefined) {
        result = images.slice(0, firstIndex ?? 0);
        if (lastIndex) {
            result.push(...images.slice(lastIndex + 1, lastIndex + 1 + (imageLimit - result.length)));
        }
    } else {
        result = images.slice(0, imageLimit);
    }

    return success({
        imageIds: result.map(x => x.id),
        amount: images.length,
    } satisfies ImageResponse);
}