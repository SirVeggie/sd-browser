import { buildImageInfo } from '$lib/server/imageUtils';
import { getImage } from '$lib/server/dataIndex';
import { error, success } from '$lib/server/responses.js';

export async function GET(e) {
    const src = e.params.src;
    const info = buildImageInfo(getImage(src));
    if (!info)
        return error('Image not found', 404);
    return success(info);
}