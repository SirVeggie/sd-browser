import { buildImageInfoForClient } from '$lib/server/imageUtils';
import { MetaDB } from '$lib/server/db';
import { getImage } from '$lib/server/dataIndex';
import { error, success } from '$lib/server/responses.js';
import type { ImageBlobs } from '$lib/types/images';

export async function GET(e) {
    const src = e.params.src;
    const wantBlobs = e.url.searchParams.get('blobs') === '1';

    if (wantBlobs) {
        if (!getImage(src))
            return error('Image not found', 404);
        const full = MetaDB.getBlobs(src);
        if (!full)
            return error('Image not found', 404);
        const blobs: ImageBlobs = {
            id: src,
            prompt: full.prompt,
            workflow: full.workflow,
            extra: full.extra,
        };
        return success(blobs);
    }

    const info = buildImageInfoForClient(getImage(src));
    if (!info)
        return error('Image not found', 404);
    return success(info);
}
