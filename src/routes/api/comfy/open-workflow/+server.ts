import { invalidAuth } from '$lib/server/auth';
import { ComfyAuthError, parseWorkflowJson, postWorkflowToComfy } from '$lib/server/comfy';
import { getImage } from '$lib/server/dataIndex';
import { buildImageInfo } from '$lib/server/imageUtils';
import { error, success } from '$lib/server/responses';

type OpenWorkflowRequest = {
    imageId?: string;
    workflow?: unknown;
    comfyToken?: string;
};

function hasNodes(workflow: unknown): boolean {
    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow))
        return false;
    return Array.isArray((workflow as { nodes?: unknown }).nodes);
}

function isOpenWorkflowRequest(body: unknown): body is OpenWorkflowRequest {
    if (!body || typeof body !== 'object')
        return false;
    const request = body as OpenWorkflowRequest;
    if (request.comfyToken !== undefined && typeof request.comfyToken !== 'string')
        return false;
    const hasImage = typeof request.imageId === 'string' && !!request.imageId.trim();
    const hasWorkflow = hasNodes(request.workflow);
    return hasImage || hasWorkflow;
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

    if (!isOpenWorkflowRequest(body)) {
        return error('Invalid request body', 400);
    }

    let workflow: unknown;
    let imageId: string | undefined;

    if (hasNodes(body.workflow)) {
        workflow = body.workflow;
        imageId = typeof body.imageId === 'string' && body.imageId.trim()
            ? body.imageId.trim()
            : undefined;
    } else {
        const id = body.imageId!.trim();
        const image = getImage(id);
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
        workflow = parsed.workflow;
        imageId = id;
    }

    try {
        await postWorkflowToComfy({
            workflow,
            imageId,
            token: body.comfyToken,
        });
    } catch (cause) {
        if (cause instanceof ComfyAuthError) {
            return error({
                error: cause.message,
                code: 'comfy_auth_required',
            }, 401);
        }
        const message = cause instanceof Error ? cause.message : 'Failed to open workflow in Comfy';
        return error(message, 502);
    }

    return success('Workflow sent to Comfy');
}
