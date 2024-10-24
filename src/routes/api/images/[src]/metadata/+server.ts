import { getImage } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';
import type { ImageInfo } from '$lib/types/images.js';

export async function GET(e) {
    const src = e.params.src;
    const image = getImage(src);
    if (!image)
        return error('Image not found', 404);
    return success({
        id: src,
        folder: image.folder,
        modifiedDate: image.modifiedDate,
        createdDate: image.createdDate,
        prompt: image.prompt,
        workflow: image.workflow,
    } satisfies ImageInfo);
}