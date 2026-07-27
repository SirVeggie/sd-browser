import { invalidAuth } from '$lib/server/auth';
import { ComfyAuthError, ComfyRequestError, convertWorkflowToApi } from '$lib/server/comfy';
import { error, success } from '$lib/server/responses';
import { getComfyTokenFromRequest } from '$lib/server/svgen/token';

type ConvertRequest = {
    workflow: unknown;
};

function isConvertRequest(body: unknown): body is ConvertRequest {
    return !!body && typeof body === 'object' && 'workflow' in body;
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

    if (!isConvertRequest(body)) {
        return error('Invalid request body', 400);
    }

    try {
        const apiPrompt = await convertWorkflowToApi(body.workflow, getComfyTokenFromRequest(e));
        return success(apiPrompt);
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
        const message = cause instanceof Error ? cause.message : 'Workflow convert failed';
        return error(message, 502);
    }
}
