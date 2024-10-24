import { page } from "$app/stores";
import { updateGlobalSettings } from "$lib/stores/globalSettings";
import { doGet, doPost, doServerGet, doServerPost, type FetchType } from "$lib/tools/requests";
import { isSettingResponse, type SettingsRequest } from "$lib/types/requests";
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