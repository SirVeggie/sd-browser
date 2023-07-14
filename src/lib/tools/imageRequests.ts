import { get } from 'svelte/store';
import { doGet, doPost, doServerGet, doServerPost, type FetchType } from './requests';
import { page } from '$app/stores';
import { isImageInfo, type ImageRequest, type ImageResponse, type ImageInfo, type QualityMode, type UpdateRequest, type UpdateResponse, type ActionRequest } from '$lib/types';

export async function searchImages(search: ImageRequest, fetch?: FetchType): Promise<ImageResponse> {
    let url = '/api/images';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, search) : doServerPost(url, search));

    if ('error' in res) {
        throw new Error(res.error);
    }

    if ('message' in res) {
        throw new Error(res.message);
    }

    return res;
}

export async function updateImages(search: UpdateRequest, fetch?: FetchType): Promise<UpdateResponse> {
    let url = '/api/images/update';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, search) : doServerPost(url, search));

    if ('error' in res) {
        throw new Error(res.error);
    }

    if ('message' in res) {
        throw new Error(res.message);
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

export async function imageAction(id: string, action: ActionRequest, fetch?: FetchType): Promise<void> {
    let url = `/api/images/${id}/action`;
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, action) : doServerPost(url, action));
    if ('error' in res)
        return console.error(res.error);
    if ('message' in res)
        return console.log(res.message);
}