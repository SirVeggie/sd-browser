import { normalizeMmrSettings, mmrSettingsDefaults, type MmrSettings } from '$lib/types/mmr';
import { MiscDB } from './db';

const settingsKey = 'settings';

export function getServerMmrSettings(): MmrSettings {
    const raw = MiscDB.get(settingsKey);
    if (!raw)
        return { ...mmrSettingsDefaults };

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return normalizeMmrSettings(parsed.mmrSettings as Partial<MmrSettings> | undefined);
    } catch {
        return { ...mmrSettingsDefaults };
    }
}
