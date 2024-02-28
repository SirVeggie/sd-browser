import { get } from 'svelte/store';
import { doGet, doPost, doServerGet, doServerPost, type FetchType } from './requests';
import { page } from '$app/stores';
import { isImageInfo, type ImageRequest, type ImageResponse, type ImageInfo, type QualityMode, type UpdateRequest, type UpdateResponse, type MultiActionRequest, type ActionRequest } from '$lib/types';
import { stealthInfo } from "$lib/stores/imageStore";

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
    stealthInfo.subscribe(stealthInfo => url = url + (stealthInfo ? '/stealth' : ''))
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

export async function imageAction(ids: string | string[], action: ActionRequest, fetch?: FetchType): Promise<void> {
    if (typeof ids === 'string') ids = [ids];

    const multiaction: MultiActionRequest = {
        ids,
        ...action
    };

    let url = "/api/images/action";
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, multiaction) : doServerPost(url, multiaction));
    if ('error' in res)
        return console.error(res.error);
    if ('message' in res)
        return console.log(res.message);
}