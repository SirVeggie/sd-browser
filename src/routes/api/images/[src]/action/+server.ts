import { deleteImages } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';
import { isActionRequest } from '$lib/types/requests';

export async function POST(e) {
    const action = await e.request.json();
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
