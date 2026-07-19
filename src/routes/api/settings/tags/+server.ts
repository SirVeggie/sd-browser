import { invalidAuth } from '$lib/server/auth';
import { error, success } from '$lib/server/responses';
import { removeTagFromAllImages, renameTagOnAllImages } from '$lib/server/tags';
import { testType } from '$lib/types/misc';
import { isValidTagName } from '$lib/types/tags';

type DeleteTagRequest = {
    name: string;
};

type RenameTagRequest = {
    oldName: string;
    newName: string;
};

function isDeleteTagRequest(object: unknown): object is DeleteTagRequest {
    return testType(object, ['name', (o) => typeof o.name === 'string']);
}

function isRenameTagRequest(object: unknown): object is RenameTagRequest {
    return testType(object, [
        'oldName',
        (o) => typeof o.oldName === 'string',
        'newName',
        (o) => typeof o.newName === 'string',
    ]);
}

/** Delete a tag from the registry and all images. */
export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const body = await e.request.json();
    if (!isDeleteTagRequest(body))
        return error('Invalid request body', 400);

    const removedFrom = removeTagFromAllImages(body.name);
    return success({ removedFrom });
}

/** Rename a tag in the registry and on all images that use it. */
export async function PATCH(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const body = await e.request.json();
    if (!isRenameTagRequest(body))
        return error('Invalid request body', 400);

    const oldName = body.oldName.trim();
    const newName = body.newName.trim();
    if (!isValidTagName(oldName) || !isValidTagName(newName))
        return error('Invalid tag name', 400);

    try {
        const renamedFrom = renameTagOnAllImages(oldName, newName);
        return success({ renamedFrom });
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Failed to rename tag';
        return error(message, 400);
    }
}
