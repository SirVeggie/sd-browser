import { type Writable } from "svelte/store";
import { migratePulledGlobalSettings } from "$lib/migrations/folderFilterMigration";

const globalSettings: Map<string, Writable<any>> = new Map();

/** True while applying settings pulled from the server (avoids push-on-pull loops). */
let applyingRemoteSettings = false;

export function isApplyingRemoteSettings(): boolean {
    return applyingRemoteSettings;
}

export function addGlobalSetting(name: string, store: Writable<any>) {
    globalSettings.set(name, store);
}

export function updateGlobalSettings(settings: Record<string, any>) {
    const migrated = migratePulledGlobalSettings(settings);
    applyingRemoteSettings = true;
    try {
        for (const key in migrated) {
            if (!globalSettings.has(key))
                continue;
            globalSettings.get(key)?.set(migrated[key]);
        }
    } finally {
        applyingRemoteSettings = false;
    }
}