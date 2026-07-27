import { invalidAuth } from '$lib/server/auth';
import { checkComfyWorkflowOpenAvailable } from '$lib/server/comfy';
import { success } from '$lib/server/responses';
import { getComfyTokenFromRequest } from '$lib/server/svgen/token';

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const status = await checkComfyWorkflowOpenAvailable(getComfyTokenFromRequest(e));
    return success(status);
}
