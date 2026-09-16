import { pushGlobalSettings } from "$lib/requests/settingRequests";
import { addGlobalSetting } from "$lib/stores/globalSettings";
import {
    NSFW_CLASSIFY_SETTINGS_KEY,
    normalizeNsfwClassifySettings,
    type NsfwClassifySettings,
} from "$lib/types/nsfwClassify";
import { writable } from "svelte/store";

export type { NsfwClassifySettings } from "$lib/types/nsfwClassify";
export {
    NSFW_CLASSIFY_NOT_CONFIGURED_MESSAGE,
    hasAssignedClassifyTags,
    nsfwClassifyStoreDefaults,
} from "$lib/types/nsfwClassify";

export const nsfwClassifyStore = writable<NsfwClassifySettings>(
    normalizeNsfwClassifySettings(undefined),
);

export function syncNsfwClassifyWithLocalStorage() {
    addGlobalSetting(NSFW_CLASSIFY_SETTINGS_KEY, nsfwClassifyStore);

    if (localStorage.getItem(NSFW_CLASSIFY_SETTINGS_KEY)) {
        const value = JSON.parse(localStorage.getItem(NSFW_CLASSIFY_SETTINGS_KEY) || "") as Partial<NsfwClassifySettings>;
        nsfwClassifyStore.set(normalizeNsfwClassifySettings(value));
    }

    nsfwClassifyStore.subscribe((x) => {
        const normalized = normalizeNsfwClassifySettings(x);
        localStorage.setItem(NSFW_CLASSIFY_SETTINGS_KEY, JSON.stringify(normalized));
        pushGlobalSettings({
            settingsJson: JSON.stringify({ [NSFW_CLASSIFY_SETTINGS_KEY]: normalized }),
        });
    });
}
