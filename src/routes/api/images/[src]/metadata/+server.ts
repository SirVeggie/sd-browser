import { buildImageInfo } from '$lib/server/imageUtils';
import { error, success } from '$lib/server/responses.js';

export async function GET(e) {
    const src = e.params.src;
    const info = buildImageInfo(src);
    if (!info)
        return error('Image not found', 404);
    return success(info);
}