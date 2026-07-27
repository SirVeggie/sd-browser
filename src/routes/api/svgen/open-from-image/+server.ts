import { invalidAuth } from '$lib/server/auth';
import { parseWorkflowJson } from '$lib/server/comfy';
import { getImage } from '$lib/server/dataIndex';
import { buildImageInfo } from '$lib/server/imageUtils';
import { error, success } from '$lib/server/responses';
import type { ComfyPrompt } from '$lib/types/images';

type OpenFromImageRequest = {
    imageId: string;
};

function isOpenFromImageRequest(body: unknown): body is OpenFromImageRequest {
    if (!body || typeof body !== 'object')
        return false;
    const request = body as OpenFromImageRequest;
    return typeof request.imageId === 'string';
}

function parsePromptJson(prompt: string | undefined): ComfyPrompt | null {
    if (!prompt?.trim())
        return null;
    const sanitized = prompt.replace(/(?<!")NaN(?!")/g, 'null');
    try {
        const parsed: unknown = JSON.parse(sanitized);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return null;
        return parsed as ComfyPrompt;
    } catch {
        return null;
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

    if (!isOpenFromImageRequest(body) || !body.imageId.trim()) {
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

    return success({
        workflow: parsed.workflow,
        prompt: parsePromptJson(info.prompt),
        sourceImageId: body.imageId,
    });
}
