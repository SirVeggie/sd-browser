import { invalidAuth } from '$lib/server/auth';
import { ComfyAuthError, ComfyRequestError, interruptComfyPrompt } from '$lib/server/comfy';
import { error, success } from '$lib/server/responses';
import { getComfyTokenFromRequest } from '$lib/server/svgen/token';

type InterruptRequest = {
    promptId?: string;
};

function isInterruptRequest(body: unknown): body is InterruptRequest {
    if (!body || typeof body !== 'object')
        return false;
    const request = body as InterruptRequest;
    return request.promptId === undefined || typeof request.promptId === 'string';
}

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

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    let body: unknown = {};
    try {
        const text = await e.request.text();
        if (text.trim())
            body = JSON.parse(text);
    } catch {
        return error('Invalid JSON request body', 400);
    }

    if (!isInterruptRequest(body)) {
        return error('Invalid request body', 400);
    }

    try {
        const result = await interruptComfyPrompt(body.promptId, getComfyTokenFromRequest(e));
        return success(result);
    } catch (cause) {
        return handleComfyError(cause, 'Interrupt failed');
    }
}
