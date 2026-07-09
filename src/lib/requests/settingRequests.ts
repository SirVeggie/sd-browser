import { page } from "$app/stores";
import { updateGlobalSettings } from "$lib/stores/globalSettings";
import { doGet, doPost, doServerGet, doServerPost, type FetchType } from "$lib/tools/requests";
import {
    isClearCompressedImagesResponse,
    isRecalculateSimilarCacheResponse,
    isSettingResponse,
    type ClearCompressedImagesResponse,
    type RecalculateSimilarCacheRequest,
    type RecalculateSimilarCacheResponse,
    type SettingsRequest,
} from "$lib/types/requests";
import { get } from "svelte/store";

export async function pushGlobalSettings(search: SettingsRequest, fetch?: FetchType): Promise<void> {
    if (!get(page).url)
        return;
    let url = '/api/settings';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, search) : doServerPost(url, search));

    if ('error' in res) {
        throw new Error(res.error);
    }
}

export async function pullGlobalSettings(fetch?: FetchType) {
    if (!get(page).url)
        return;
    let url = '/api/settings';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doGet(url, fetch) : doServerGet(url));
    if (!isSettingResponse(res)) {
        console.log(res);
        throw new Error('Invalid settings response');
    }
    const settings = JSON.parse(res.settingsJson) as Record<string, any>;
    updateGlobalSettings(settings);
}

export async function recalculateSimilarCache(
    request: RecalculateSimilarCacheRequest,
    fetch?: FetchType,
): Promise<RecalculateSimilarCacheResponse> {
    if (!get(page).url)
        throw new Error('Page not loaded');
    let url = '/api/settings/similar-cache';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, request) : doServerPost(url, request));

    if ('error' in res)
        throw new Error(res.error);
    if (!isRecalculateSimilarCacheResponse(res))
        throw new Error('Invalid similarity cache response');
    return res;
}

export async function clearCompressedImages(fetch?: FetchType): Promise<ClearCompressedImagesResponse> {
    if (!get(page).url)
        throw new Error('Page not loaded');
    let url = '/api/settings/clear-compressed';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, {}) : doServerPost(url, {}));

    if ('error' in res)
        throw new Error(res.error);
    if (!isClearCompressedImagesResponse(res))
        throw new Error('Invalid clear compressed images response');
    return res;
}