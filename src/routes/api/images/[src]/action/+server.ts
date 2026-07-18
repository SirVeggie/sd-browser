import { invalidAuth } from '$lib/server/auth.js';
import { deleteImages } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';
import { isActionRequest } from '$lib/types/requests';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    let action: unknown;
    try {
        action = await e.request.json();
    } catch {
        return error('Invalid JSON request body', 400);
    }
    const id = e.params.src;
    if (!isActionRequest(action)) {
        return error('Invalid request body', 400);
    }

    if (action.type === 'delete') {
        deleteImages(id);
        return success();
    }

    return error('Invalid request body', 400);
}
