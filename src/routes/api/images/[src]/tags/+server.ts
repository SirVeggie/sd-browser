import { invalidAuth } from '$lib/server/auth';
import { getImage } from '$lib/server/dataIndex';
import { buildImageInfo } from '$lib/server/imageUtils';
import { error, success } from '$lib/server/responses';
import { setImageTags } from '$lib/server/tags';
import { isValidTagName } from '$lib/types/tags';
import { testType } from '$lib/types/misc';

type ImageTagsRequest = {
    tags: string[];
};

function isImageTagsRequest(object: unknown): object is ImageTagsRequest {
    return testType(object, [
        'tags',
        (o) => Array.isArray(o.tags) && o.tags.every((tag: unknown) => typeof tag === 'string'),
    ]);
}

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const info = buildImageInfo(getImage(e.params.src));
    if (!info)
        return error('Image not found', 404);

    return success({ tags: info.tags ?? [] });
}

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const info = buildImageInfo(getImage(e.params.src));
    if (!info)
        return error('Image not found', 404);

    let body: unknown;
    try {
        body = await e.request.json();
    } catch {
        return error('Invalid JSON request body', 400);
    }
    if (!isImageTagsRequest(body))
        return error('Invalid request body', 400);

    const tags = [...new Set(body.tags.map((tag) => tag.trim()).filter(Boolean))];
    if (tags.some((tag) => !isValidTagName(tag)))
        return error('Invalid tag name', 400);

    setImageTags(e.params.src, tags);
    return success({ tags });
}
