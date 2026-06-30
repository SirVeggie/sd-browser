import { invalidAuth } from '$lib/server/auth.js';
import { getOperations } from '$lib/server/operations.js';
import { success } from '$lib/server/responses.js';

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    return success({ operations: getOperations() });
}
