import { invalidAuth } from '$lib/server/auth.js';
import { error, success } from '$lib/server/responses.js';
import {
    explorationFromRequest,
    formatSearchFailureMessage,
    logSearchFailure,
    searchImagesAsync,
} from '$lib/server/searching';
import { isMatchRequest, type MatchResponse } from '$lib/types/requests';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query = await e.request.json();
    if (!isMatchRequest(query)) {
        return error('Invalid request body', 400);
    }

    try {
        const { images } = await searchImagesAsync(
            query.search,
            query.matching,
            explorationFromRequest(query),
        );
        return success({
            total: images.length,
        } satisfies MatchResponse);
    } catch (cause) {
        logSearchFailure(cause);
        return error(formatSearchFailureMessage(cause), cause instanceof Error ? 200 : 400);
    }
}
