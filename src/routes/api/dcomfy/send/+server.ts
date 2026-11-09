import { invalidAuth } from '$lib/server/auth';
import { getImage } from '$lib/server/dataIndex';
import { DcomfyRequestError, sendImageToDcomfy } from '$lib/server/dcomfy';
import { error, success } from '$lib/server/responses';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    let body: unknown;
    try {
        body = await e.request.json();
    } catch {
        return error('Invalid JSON request body', 400);
    }
    const imageId = (body as { imageId?: unknown } | null)?.imageId;
    if (typeof imageId !== 'string' || !imageId.trim())
        return error('Invalid request body', 400);

    const image = getImage(imageId.trim());
    if (!image)
        return error('Image not found', 404);

    try {
        return success(await sendImageToDcomfy(image.file));
    } catch (cause) {
        if (cause instanceof DcomfyRequestError)
            return error(cause.message, cause.status);
        return error(cause instanceof Error ? cause.message : 'Failed to send the image to Dynamic Comfy', 502);
    }
}
