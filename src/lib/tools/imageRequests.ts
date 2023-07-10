import { get } from 'svelte/store';
import { doGet, doPost, doServerGet, doServerPost, type FetchType } from './requests';
import { page } from '$app/stores';
import { isImageInfo, type ImageRequest, type ImageResponse, type ImageInfo, type QualityMode } from '$lib/types';

export async function searchImages(search: Partial<ImageRequest>, fetch?: FetchType): Promise<ImageResponse> {
    const def: ImageRequest = {
        search: '',
        matching: 'regex',
        latestId: '',
        oldestId: '',
        sorting: 'date',
        collapse: false,
    };

    const req = { ...def, ...search };
    let url = '/api/images';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, req) : doServerPost(url, req));

    if ('error' in res) {
        console.error(res.error);
        return {
            amount: 0,
            imageIds: [],
        } satisfies ImageResponse;
    }

    if ('message' in res) {
        console.error(res.message);
        return {
            amount: 0,
            imageIds: [],
        } satisfies ImageResponse;
    }

    return res;
}

export function getQualityParam(mode: QualityMode) {
    switch (mode) {
        case 'original':
            return 'quality=original';
        case 'medium':
            return 'quality=medium';
        case 'low':
            return 'quality=low';
    }
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

export async function generateCompressedImages(ids: string[], fetch?: FetchType): Promise<void> {
    if (!ids || !ids.length)
        return console.log('Invalid generation request');
    let url = `/api/generate`;
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, ids) : doServerPost(url, ids));
    if ('error' in res)
        return console.error(res.error);
    if ('message' in res)
        return console.log(res.message);
}