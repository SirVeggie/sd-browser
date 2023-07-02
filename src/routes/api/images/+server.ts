import { PASS } from '$env/static/private';
import { IndexFiles } from '$lib/server/filemanager.js';
import { error, image, success } from '$lib/server/responses';
import type { ImageList } from '$lib/types.js';

let imgs: ImageList = {};

export async function GET(e) {
    if (!e.url.searchParams.has('src')) {
        const auth = e.request.headers.get('Authorization');

        if (!auth) return error('No authorization header', 401);
        if (auth !== PASS) return error('Invalid authorization header', 401);

        const res = await IndexFiles();
        if ('error' in res) return error(res as any, 500);
        imgs = res;
        return success(mapToFrontend(res));
    }

    const src = e.url.searchParams.get('src');

    if (!imgs[src ?? ''])
        return error('Image not found', 404);

    return image(imgs[src ?? ''].file);
}

function mapToFrontend(images: ImageList) {
    const ret: ImageList = {};
    for (const key of Object.keys(images)) {
        ret[key] = {
            ...images[key],
            file: `/api/images?src=${key}`,
        };
    }
    return ret;
}