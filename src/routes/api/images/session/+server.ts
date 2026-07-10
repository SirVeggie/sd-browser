import { invalidAuth } from '$lib/server/auth';
import { computeImageUpdate } from '$lib/server/imageUpdates';
import {
    replaceSessionResults,
    setSessionExcluded,
} from '$lib/server/searchSessions';
import { error, success } from '$lib/server/responses';
import {
    isSessionExclusionRequest,
    type UpdateResponse,
} from '$lib/types/requests';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const request = await e.request.json();
    if (!isSessionExclusionRequest(request)) {
        return error('Invalid request body', 400);
    }

    const session = setSessionExcluded(
        request.sessionId,
        request.ids,
        request.excluded,
    );
    if (!session) {
        return error('Session not found', 404);
    }

    const result = await computeImageUpdate(
        {
            ...session.query,
            timestamp: Date.now(),
            currentIds: [...session.viewIds],
        },
        session,
    );
    if ('error' in result) {
        return error(result.error, result.status ?? 400);
    }

    if (result.orderedIds) {
        replaceSessionResults(request.sessionId, result.orderedIds);
    }

    return success(result satisfies UpdateResponse);
}
