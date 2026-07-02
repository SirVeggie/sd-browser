import { invalidAuth } from '$lib/server/auth';
import { error, success } from '$lib/server/responses';
import { removeTagFromAllImages } from '$lib/server/tags';
import { testType } from '$lib/types/misc';

type DeleteTagRequest = {
    name: string;
};

function isDeleteTagRequest(object: unknown): object is DeleteTagRequest {
    return testType(object, ['name', (o) => typeof o.name === 'string']);
}

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const body = await e.request.json();
    if (!isDeleteTagRequest(body))
        return error('Invalid request body', 400);

    const removedFrom = removeTagFromAllImages(body.name);
    return success({ removedFrom });
}
