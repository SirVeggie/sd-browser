import { get } from 'svelte/store';
import { page } from '$app/stores';
import { doGet, doPost, doServerGet, doServerPost, type FetchType } from '$lib/tools/requests';

export async function fetchImageAnnotation(imageId: string, fetch?: FetchType): Promise<string> {
    let url = `/api/images/${imageId}/annotation`;
    if (!fetch)
        url = get(page).url.origin + url;

    const res = await (fetch ? doGet(url, fetch) : doServerGet(url));
    if ('error' in res)
        throw new Error(res.error);

    if (typeof res.annotation !== 'string')
        throw new Error('Invalid annotation response');

    return res.annotation;
}

export async function updateImageAnnotation(imageId: string, annotation: string, fetch?: FetchType): Promise<string> {
    let url = `/api/images/${imageId}/annotation`;
    if (!fetch)
        url = get(page).url.origin + url;

    const res = await (fetch ? doPost(url, fetch, { annotation }) : doServerPost(url, { annotation }));
    if ('error' in res)
        throw new Error(res.error);

    if (typeof res.annotation !== 'string')
        throw new Error('Invalid annotation response');

    return res.annotation;
}
