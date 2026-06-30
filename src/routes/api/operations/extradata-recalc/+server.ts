import { invalidAuth } from '$lib/server/auth.js';
import { isOperationTypeRunning } from '$lib/server/operations.js';
import { startExtradataRecalc } from '$lib/server/extradataRecalc.js';
import { error, success } from '$lib/server/responses.js';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    if (isOperationTypeRunning('extradata-recalc'))
        return error('Extradata recalculation is already running', 409);

    try {
        const { operationId } = startExtradataRecalc();
        return success({ operationId });
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Failed to start recalculation';
        return error(message, 409);
    }
}
