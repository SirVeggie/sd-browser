import { invalidAuth } from '$lib/server/auth';
import { ComfyAuthError, parseWorkflowJson, postWorkflowToComfy } from '$lib/server/comfy';
import { getImage } from '$lib/server/dataIndex';
import { buildImageInfo } from '$lib/server/imageUtils';
import { error, success } from '$lib/server/responses';

type OpenWorkflowRequest = {
    imageId: string;
    comfyToken?: string;
};

function isOpenWorkflowRequest(body: unknown): body is OpenWorkflowRequest {
    if (!body || typeof body !== 'object')
        return false;
    const request = body as OpenWorkflowRequest;
    return typeof request.imageId === 'string'
        && (request.comfyToken === undefined || typeof request.comfyToken === 'string');
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

    if (!isOpenWorkflowRequest(body) || !body.imageId.trim()) {
        return error('Invalid request body', 400);
    }

    const image = getImage(body.imageId);
    if (!image) {
        return error('Image not found', 404);
    }

    const info = buildImageInfo(image);
    if (!info?.workflow?.trim()) {
        return error('Image has no workflow metadata', 400);
    }

    const parsed = parseWorkflowJson(info.workflow);
    if (!parsed.ok) {
        return error(parsed.error, 400);
    }

    try {
        await postWorkflowToComfy({
            workflow: parsed.workflow,
            imageId: body.imageId,
            token: body.comfyToken,
        });
    } catch (cause) {
        if (cause instanceof ComfyAuthError) {
            return error({
                error: cause.message,
                code: 'comfy_auth_required',
            }, 401);
        }
        const message = cause instanceof Error ? cause.message : 'Failed to open workflow in ComfyUI';
        return error(message, 502);
    }

    return success('Workflow sent to ComfyUI');
}
