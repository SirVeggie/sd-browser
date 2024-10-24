import { pushGlobalSettings } from "$lib/requests/settingRequests";
import { addGlobalSetting } from "$lib/stores/globalSettings";
import type { Writable } from "svelte/store";

export function syncMemory<T>(name: string, store: Writable<T>, global = false) {
    if (global) {
        addGlobalSetting(name, store);
    }
    
    if (localStorage.getItem(name)) {
        const value = JSON.parse(localStorage.getItem(name) || '');
        store.set(value);
    }
    
    store.subscribe(x => {
        localStorage.setItem(name, JSON.stringify(x));
        if (global) {
            pushGlobalSettings({
                settingsJson: JSON.stringify({ [name]: x }),
            });
        }
    });
}