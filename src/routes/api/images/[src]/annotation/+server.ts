import { invalidAuth } from '$lib/server/auth';
import { getImage } from '$lib/server/dataIndex';
import { buildImageInfo } from '$lib/server/imageUtils';
import { setImageAnnotation } from '$lib/server/annotations';
import { error, success } from '$lib/server/responses';
import { testType } from '$lib/types/misc';

type ImageAnnotationRequest = {
    annotation: string;
};

function isImageAnnotationRequest(object: unknown): object is ImageAnnotationRequest {
    return testType(object, [
        'annotation',
        (o) => typeof o.annotation === 'string',
    ]);
}

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const info = buildImageInfo(getImage(e.params.src), { includeBlobs: false });
    if (!info)
        return error('Image not found', 404);

    return success({ annotation: info.annotation ?? '' });
}

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const info = buildImageInfo(getImage(e.params.src), { includeBlobs: false });
    if (!info)
        return error('Image not found', 404);

    let body: unknown;
    try {
        body = await e.request.json();
    } catch {
        return error('Invalid JSON request body', 400);
    }
    if (!isImageAnnotationRequest(body))
        return error('Invalid request body', 400);

    const annotation = body.annotation;
    setImageAnnotation(e.params.src, annotation);
    return success({ annotation });
}
