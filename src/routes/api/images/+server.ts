import { invalidAuth } from '$lib/server/auth.js';
import { error, success } from '$lib/server/responses.js';
import { applyResultSkip, searchImages, sortImages } from '$lib/server/searching';
import { mapServerImageToClient } from '$lib/tools/misc.js';
import { type ServerImage } from '$lib/types/images';
import { type ImageResponse, isImageRequest } from '$lib/types/requests';

const imageLimit = 1000;

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query = await e.request.json();
    if (!isImageRequest(query))
        return error('Invalid request body', 400);

    let images: ServerImage[] = [];
    try {
        images = searchImages(query.search, query.filters, query.matching, query.collapse, undefined, false);
        images = sortImages(images, query.sorting);
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

    const firstIndex = !query.latestId ? undefined : images.findIndex(i => i.id === query.latestId);
    const lastIndex = !query.oldestId ? undefined : images.findIndex(i => i.id === query.oldestId);

    if (firstIndex === -1 || lastIndex === -1) {
        return error('Invalid request: image id not found', 400);
    }

    let result: ServerImage[] = [];
    if (firstIndex != undefined || lastIndex != undefined) {
        result = images.slice(0, firstIndex ?? 0);
        if (lastIndex) {
            result.push(...images.slice(lastIndex + 1, lastIndex + 1 + (imageLimit - result.length)));
        }
    } else if (query.sorting !== 'random') {
        result = images.slice(0, imageLimit);
    } else {
        result = images;
    }

    return success({
        images: mapServerImageToClient(result),
        amount: images.length,
        timestamp: Date.now(),
    } satisfies ImageResponse);
}