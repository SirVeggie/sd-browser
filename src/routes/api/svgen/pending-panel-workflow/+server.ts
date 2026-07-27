import { invalidAuth } from '$lib/server/auth';
import {
    ComfyAuthError,
    ComfyRequestError,
    fetchPendingPanelWorkflow,
} from '$lib/server/comfy';
import { error, success } from '$lib/server/responses';
import { getComfyTokenFromRequest } from '$lib/server/svgen/token';

function handleComfyError(cause: unknown, fallback: string): Response {
    if (cause instanceof ComfyAuthError) {
        return error({
            error: cause.message,
            code: 'comfy_auth_required',
        }, 401);
    }
    if (cause instanceof ComfyRequestError) {
        return error(cause.message, cause.status);
    }
    const message = cause instanceof Error ? cause.message : fallback;
    return error(message, 502);
}

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    try {
        const pending = await fetchPendingPanelWorkflow(getComfyTokenFromRequest(e));
        if (!pending)
            return success({ workflow: null });
        return success(pending);
    } catch (cause) {
        return handleComfyError(cause, 'Pending panel workflow fetch failed');
    }
}
