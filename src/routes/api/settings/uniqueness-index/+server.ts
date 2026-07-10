import { invalidAuth } from '$lib/server/auth';
import { buildUniquenessIndex } from '$lib/server/uniquenessIndex';
import { error, success } from '$lib/server/responses';
import { isBuildUniquenessIndexResponse } from '$lib/types/requests';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    try {
        const result = await buildUniquenessIndex();
        const response = { indexed: result.indexed };
        if (!isBuildUniquenessIndexResponse(response))
            return error('Invalid uniqueness index response', 500);
        return success(response);
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Failed to build uniqueness index';
        return error(message, 500);
    }
}
