import { invalidAuth } from '$lib/server/auth';
import { ComfyAuthError, viewComfyImage } from '$lib/server/comfy';
import { error } from '$lib/server/responses';
import { getComfyTokenFromRequest } from '$lib/server/svgen/token';

export async function GET(e) {
    const err = invalidAuth(e);
    if (err)
        return err;

    const filename = e.url.searchParams.get('filename')?.trim();
    if (!filename)
        return error('Missing filename', 400);

    const params = new URLSearchParams();
    params.set('filename', filename);
    const type = e.url.searchParams.get('type')?.trim() || 'input';
    params.set('type', type);
    const subfolder = e.url.searchParams.get('subfolder')?.trim();
    if (subfolder)
        params.set('subfolder', subfolder);
    const preview = e.url.searchParams.get('preview')?.trim();
    if (preview)
        params.set('preview', preview);
    const rand = e.url.searchParams.get('rand')?.trim();
    if (rand)
        params.set('rand', rand);

    try {
        const response = await viewComfyImage(params, getComfyTokenFromRequest(e));
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return error(text || `Comfy view failed (${response.status})`, response.status);
        }
        const headers = new Headers();
        const contentType = response.headers.get('content-type');
        if (contentType)
            headers.set('content-type', contentType);
        headers.set('cache-control', 'private, max-age=60');
        return new Response(response.body, { status: 200, headers });
    } catch (cause) {
        if (cause instanceof ComfyAuthError)
            return error({ error: 'ComfyUI authentication required', code: 'comfy_auth_required' }, 401);
        const detail = cause instanceof Error ? cause.message : String(cause);
        return error(detail, 502);
    }
}
