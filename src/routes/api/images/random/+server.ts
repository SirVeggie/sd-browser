import { invalidAuth } from '$lib/server/auth.js';
import { error, success } from '$lib/server/responses.js';
import {
    explorationFromRequest,
    formatSearchFailureMessage,
    logSearchFailure,
    pickRandomMatchingImage,
    SearchStreamAborted,
} from '$lib/server/searching';
import { defaultExplorationSettings, isSearchMode } from '$lib/types/misc';
import {
    isRandomImageRequest,
    type RandomImageResponse,
} from '$lib/types/requests';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query = await e.request.json();
    if (!isRandomImageRequest(query))
        return error('Invalid request body', 400);

    const matching = query.matching ?? 'regex';
    if (!isSearchMode(matching))
        return error('Invalid matching mode', 400);

    try {
        const image = await pickRandomMatchingImage(
            query.search,
            matching,
            explorationFromRequest({
                explorationMode: query.explorationMode ?? defaultExplorationSettings.explorationMode,
                sparseFrequency: query.sparseFrequency ?? defaultExplorationSettings.sparseFrequency,
                similarityAlgorithm: query.similarityAlgorithm ?? defaultExplorationSettings.similarityAlgorithm,
                similarityThreshold: query.similarityThreshold ?? defaultExplorationSettings.similarityThreshold,
            }),
            {
                signal: e.request.signal,
                tempEmbeddings: query.tempEmbeddings,
                skipVideos: query.skipVideos !== false,
            },
        );
        if (!image)
            return error('No matching images', 404);

        return success({
            id: image.id,
        } satisfies RandomImageResponse);
    } catch (cause) {
        if (cause instanceof SearchStreamAborted || e.request.signal.aborted)
            return error('Client disconnected', 499);
        logSearchFailure(cause);
        return error(formatSearchFailureMessage(cause), 400);
    }
}
