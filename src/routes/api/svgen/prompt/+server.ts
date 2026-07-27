import { invalidAuth } from '$lib/server/auth';
import { ComfyAuthError, ComfyRequestError, submitComfyPrompt } from '$lib/server/comfy';
import { error, success } from '$lib/server/responses';
import { getComfyTokenFromRequest } from '$lib/server/svgen/token';

type PromptRequest = {
    prompt: Record<string, unknown>;
    workflow?: unknown;
    clientId?: string;
    promptId?: string;
};

function isPromptRequest(body: unknown): body is PromptRequest {
    if (!body || typeof body !== 'object')
        return false;
    const request = body as PromptRequest;
    return !!request.prompt
        && typeof request.prompt === 'object'
        && !Array.isArray(request.prompt)
        && (request.workflow === undefined || typeof request.workflow === 'object')
        && (request.clientId === undefined || typeof request.clientId === 'string')
        && (request.promptId === undefined || typeof request.promptId === 'string');
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

    if (!isPromptRequest(body)) {
        return error('Invalid request body', 400);
    }

    try {
        const result = await submitComfyPrompt({
            prompt: body.prompt,
            workflow: body.workflow,
            clientId: body.clientId,
            promptId: body.promptId,
            token: getComfyTokenFromRequest(e),
        });
        return success(result);
    } catch (cause) {
        if (cause instanceof ComfyAuthError) {
            return error({
                error: cause.message,
                code: 'comfy_auth_required',
            }, 401);
        }
        if (cause instanceof ComfyRequestError) {
            return error(cause.message, cause.status);
        }
        const message = cause instanceof Error ? cause.message : 'Prompt submit failed';
        return error(message, 502);
    }
}
