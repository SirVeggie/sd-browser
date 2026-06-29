import { invalidAuth } from '$lib/server/auth';
import { error, success } from '$lib/server/responses';
import { computeImageUpdate, hasUpdateChanges } from '$lib/server/imageUpdates';
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

    const result = computeImageUpdate(query);
    if ('error' in result) {
        return error(result.error, result.status ?? 400);
    }

    return success(result satisfies UpdateResponse);
}
