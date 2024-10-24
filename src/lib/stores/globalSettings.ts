import { type Writable } from "svelte/store";

const globalSettings: Map<string, Writable<any>> = new Map();

export function addGlobalSetting(name: string, store: Writable<any>) {
    globalSettings.set(name, store);
}

export function updateGlobalSettings(settings: Record<string, any>) {
    for (const key in settings) {
        if (!globalSettings.has(key))
            continue;
        globalSettings.get(key)?.set(settings[key]);
    }
}