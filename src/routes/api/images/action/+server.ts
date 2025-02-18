import { copyImages, deleteImages, markFavorite, markNsfw, moveImages, openExplorer } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';
import { isMultiActionRequest } from '$lib/types/requests';

export async function POST(e) {
    const action = await e.request.json();
    
    if (!isMultiActionRequest(action)) {
        return error('Invalid request body', 400);
    }
    
    if (action.type === 'nsfw') {
        markNsfw(action.ids, action.state);
        return success();
    } else if (action.type === 'favorite') {
        markFavorite(action.ids, action.state);
        return success();
    } else if (action.type === 'move') {
        moveImages(action.ids, action.folder);
        return success();
    } else if (action.type === 'copy') {
        copyImages(action.ids, action.folder);
        return success();
    } else if (action.type === 'delete') {
        deleteImages(action.ids);
        return success();
    } else if (action.type === 'open') {
        openExplorer(action.ids[0]);
        return success();
    }
}