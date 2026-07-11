import { copyImages, deleteImages, moveImages, openExplorer } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';
import { isMultiActionRequest } from '$lib/types/requests';

export async function POST(e) {
    let action: unknown;
    try {
        action = await e.request.json();
    } catch {
        return error('Invalid JSON request body', 400);
    }

    if (!isMultiActionRequest(action)) {
        return error('Invalid request body', 400);
    }

    if (action.type === 'move') {
        await moveImages(action.ids, action.folder);
        return success();
    } else if (action.type === 'copy') {
        await copyImages(action.ids, action.folder);
        return success();
    } else if (action.type === 'delete') {
        await deleteImages(action.ids);
        return success();
    } else if (action.type === 'open') {
        openExplorer(action.ids[0]);
        return success();
    }

    return error('Invalid request body', 400);
}
