import { invalidAuth } from '$lib/server/auth';
import { ComfyAuthError, ComfyRequestError, getComfyQueue, postComfyQueue } from '$lib/server/comfy';
import { error, success } from '$lib/server/responses';
import { getComfyTokenFromRequest } from '$lib/server/svgen/token';

type QueueUpdateRequest = {
    delete?: string[];
    clear?: boolean;
};

function isQueueUpdateRequest(body: unknown): body is QueueUpdateRequest {
    if (!body || typeof body !== 'object')
        return false;
    const request = body as QueueUpdateRequest;
    if (request.delete !== undefined && !Array.isArray(request.delete))
        return false;
    if (request.clear !== undefined && typeof request.clear !== 'boolean')
        return false;
    return request.delete !== undefined || request.clear !== undefined;
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

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    try {
        return success(await getComfyQueue(getComfyTokenFromRequest(e)));
    } catch (cause) {
        return handleComfyError(cause, 'Queue fetch failed');
    }
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

    if (!isQueueUpdateRequest(body)) {
        return error('Invalid request body', 400);
    }

    try {
        const result = await postComfyQueue(body, getComfyTokenFromRequest(e));
        return success(result);
    } catch (cause) {
        return handleComfyError(cause, 'Queue update failed');
    }
}
