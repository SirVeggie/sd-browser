import type { RequestEvent } from '@sveltejs/kit';
import { invalidAuth } from '$lib/server/auth';
import { checkComfyWorkflowOpenAvailable } from '$lib/server/comfy';
import { success } from '$lib/server/responses';

function getComfyToken(e: RequestEvent): string | undefined {
    const auth = e.request.headers.get('X-Comfy-Authorization') ?? '';
    const prefix = 'Bearer ';
    if (auth.startsWith(prefix))
        return auth.slice(prefix.length);
    return undefined;
}

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    return success(await checkComfyWorkflowOpenAvailable(getComfyToken(e)));
}
