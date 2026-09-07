import { invalidAuth } from '$lib/server/auth';
import { ComfyAuthError, ComfyRequestError, comfyErrorResponseBody, fetchComfyLoraTriggers } from '$lib/server/comfy';
import { error, success } from '$lib/server/responses';
import { getComfyTokenFromRequest } from '$lib/server/svgen/token';

type TriggersRequest = {
    names: unknown[];
};

function isTriggersRequest(body: unknown): body is TriggersRequest {
    return !!body
        && typeof body === 'object'
        && 'names' in body
        && Array.isArray((body as TriggersRequest).names);
}

function handleComfyError(cause: unknown, fallback: string): Response {
    if (cause instanceof ComfyAuthError) {
        return error({
            error: cause.message,
            code: 'comfy_auth_required',
        }, 401);
    }
    if (cause instanceof ComfyRequestError) {
        return error(comfyErrorResponseBody(cause), cause.status);
    }
    const message = cause instanceof Error ? cause.message : fallback;
    return error(message, 502);
}

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    let body: unknown;
    try {
        body = await e.request.json();
    } catch {
        return error('Invalid JSON request body', 400);
    }

    if (!isTriggersRequest(body))
        return error('Invalid request body', 400);

    const names = body.names.filter((name): name is string => typeof name === 'string');

    try {
        return success(await fetchComfyLoraTriggers(names, getComfyTokenFromRequest(e)));
    } catch (cause) {
        return handleComfyError(cause, 'LoRA triggers failed');
    }
}
