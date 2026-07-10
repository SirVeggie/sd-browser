import { pushGlobalSettings } from "$lib/requests/settingRequests";
import { addGlobalSetting } from "$lib/stores/globalSettings";
import {
    mmrSettingsDefaults,
    normalizeMmrSettings,
    type MmrSettings,
} from "$lib/types/mmr";
import { writable } from "svelte/store";

export type { MmrSettings } from "$lib/types/mmr";
export { mmrSettingsDefaults, mmrCandidatePoolStrategies } from "$lib/types/mmr";

export const mmrStore = writable<MmrSettings>({ ...mmrSettingsDefaults });

export function syncMmrWithLocalStorage() {
    const name = "mmrSettings";
    addGlobalSetting(name, mmrStore);

    if (localStorage.getItem(name)) {
        const value = JSON.parse(localStorage.getItem(name) || "") as Partial<MmrSettings>;
        mmrStore.set(normalizeMmrSettings(value));
    }

    mmrStore.subscribe((value) => {
        localStorage.setItem(name, JSON.stringify(value));
        pushGlobalSettings({
            settingsJson: JSON.stringify({ [name]: value }),
        });
    });
}
