import { invalidAuth } from '$lib/server/auth';
import { clearCompressedImages } from '$lib/server/imageCache';
import { error, success } from '$lib/server/responses';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    try {
        const deleted = await clearCompressedImages();
        return success({ deleted });
    } catch (cause) {
        console.error(cause);
        return error('Failed to clear compressed images', 500);
    }
}
