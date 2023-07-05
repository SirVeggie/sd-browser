import { get } from 'svelte/store';
import { doGet, doPost, doServerGet, doServerPost, type FetchType } from './requests';
import { page } from '$app/stores';
import { isImageInfo, type ImageRequest, type ImageResponse, type ImageInfo } from '$lib/types';

export async function searchImages(search: Partial<ImageRequest>, fetch?: FetchType): Promise<ImageResponse> {
    const def: ImageRequest = {
        search: '',
        matching: 'regex',
        latestId: '',
        oldestId: '',
        sorting: 'date',
    };

    const req = { ...def, ...search };
    let url = '/api/images';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, req) : doServerPost(url, req));

    return res;
}

export async function getImageInfo(imageid: string, fetch?: FetchType): Promise<ImageInfo | undefined> {
    let url = `/api/images/${imageid}/metadata`;
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doGet(url, fetch) : doServerGet(url));
    if (isImageInfo(res))
        return res;
    return undefined;
}