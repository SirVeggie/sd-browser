import { invalidAuth } from '$lib/server/auth.js';
import { error, success } from '$lib/server/responses.js';
import {
    getSession,
    getSessionImgSearchError,
    sliceSession,
    trackSessionViewIds,
} from '$lib/server/searchSessions';
import { formatSearchFailureMessage, logSearchFailure } from '$lib/server/searching';
import { mapServerImageToClient } from '$lib/tools/misc.js';
import { type ImageResponse, isImagePageRequest } from '$lib/types/requests';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query = await e.request.json();
    if (!isImagePageRequest(query))
        return error('Invalid request body', 400);

    try {
        const session = getSession(query.sessionId);
        if (!session)
            return error('Session not found', 404);

        const images = sliceSession(query.sessionId, query.latestId, query.oldestId);
        trackSessionViewIds(query.sessionId, images.map((image) => image.id));

        return success({
            images: mapServerImageToClient(images),
            amount: session.orderedIds.length,
            timestamp: Date.now(),
            imgSearchError: getSessionImgSearchError(session),
        } satisfies ImageResponse);
    } catch (err) {
        if (err instanceof Error) {
            if (err.message === 'Invalid request: image id not found') {
                return error(err.message, 400);
            }
            logSearchFailure(err);
            return error(formatSearchFailureMessage(err), 200);
        }
        logSearchFailure(err);
        return error(formatSearchFailureMessage(err), 400);
    }
}
