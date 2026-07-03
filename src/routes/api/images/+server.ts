import { invalidAuth } from '$lib/server/auth.js';
import { error, success } from '$lib/server/responses.js';
import {
    getSession,
    getSessionImgSearchError,
    sliceImages,
    sliceSession,
    trackSessionViewIds,
    validateSession,
    runSearch,
} from '$lib/server/searchSessions';
import { mapServerImageToClient } from '$lib/tools/misc.js';
import { type ServerImage } from '$lib/types/images';
import { type ImageResponse, isImageRequest } from '$lib/types/requests';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query = await e.request.json();
    if (!isImageRequest(query))
        return error('Invalid request body', 400);

    let images: ServerImage[] = [];
    let amount = 0;
    let imgSearchError: string | undefined;

    try {
        if (query.sessionId && validateSession(query.sessionId, query)) {
            const session = getSession(query.sessionId);
            images = sliceSession(query.sessionId, query.latestId, query.oldestId);
            amount = session!.orderedIds.length;
            imgSearchError = getSessionImgSearchError(session);
            trackSessionViewIds(query.sessionId, images.map((image) => image.id));
        } else {
            const searchResult = await runSearch(query);
            images = searchResult.images;
            imgSearchError = searchResult.imgSearchError;
            amount = images.length;
            images = sliceImages(images, query.sorting, query.latestId || undefined, query.oldestId || undefined);
        }
    } catch (err) {
        if (err instanceof Error) {
            if (err.message === 'Invalid request: image id not found') {
                return error(err.message, 400);
            }
            console.log(`${err.message}`);
            return error('Malformed search string', 200);
        }
        console.log(err);
        return error('Malformed search string', 400);
    }

    return success({
        images: mapServerImageToClient(images),
        amount,
        timestamp: Date.now(),
        imgSearchError,
    } satisfies ImageResponse);
}
