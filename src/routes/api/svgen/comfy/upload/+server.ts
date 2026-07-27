import { invalidAuth } from '$lib/server/auth';
import { ComfyAuthError, ComfyRequestError, uploadComfyImage } from '$lib/server/comfy';
import { error, success } from '$lib/server/responses';
import { getComfyTokenFromRequest } from '$lib/server/svgen/token';

const FOLDER_TYPES = new Set(['input', 'output', 'temp']);

export async function POST(e) {
    const err = invalidAuth(e);
    if (err)
        return err;

    let form: FormData;
    try {
        form = await e.request.formData();
    } catch {
        return error('Expected multipart form data', 400);
    }

    const file = form.get('image');
    if (!(file instanceof File))
        return error('Missing image file', 400);

    const rawType = String(form.get('type') ?? 'input');
    const folderType = (FOLDER_TYPES.has(rawType) ? rawType : 'input') as 'input' | 'output' | 'temp';

    try {
        const result = await uploadComfyImage(
            file,
            file.name || 'upload.png',
            folderType,
            getComfyTokenFromRequest(e),
        );
        return success(result);
    } catch (cause) {
        if (cause instanceof ComfyAuthError)
            return error({ error: 'ComfyUI authentication required', code: 'comfy_auth_required' }, 401);
        if (cause instanceof ComfyRequestError)
            return error(cause.message, cause.status);
        const detail = cause instanceof Error ? cause.message : String(cause);
        return error(detail, 502);
    }
}
