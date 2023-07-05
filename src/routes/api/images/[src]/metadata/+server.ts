import { getImage } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';
import type { ImageInfo } from '$lib/types.js';

export async function GET(e) {
    const src = e.params.src;
    const image = getImage(src);
    if (!image)
        return error('Image not found', 404);
    return success({
        id: src,
        modifiedDate: image.modifiedDate,
        createdDate: image.createdDate,
        prompt: image.prompt,
    } satisfies ImageInfo);
}