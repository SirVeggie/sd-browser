import type { RequestEvent } from '@sveltejs/kit';

export function getComfyTokenFromRequest(e: RequestEvent): string | undefined {
    const auth = e.request.headers.get('X-Comfy-Authorization') ?? '';
    const prefix = 'Bearer ';
    if (auth.startsWith(prefix))
        return auth.slice(prefix.length);
    return undefined;
}
