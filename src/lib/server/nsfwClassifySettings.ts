import { MiscDB } from './db';
import {
    NSFW_CLASSIFY_SETTINGS_KEY,
    normalizeNsfwClassifySettings,
    type NsfwClassifySettings,
} from '$lib/types/nsfwClassify';

const settingsKey = 'settings';

export function readNsfwClassifySettings(): NsfwClassifySettings {
    const raw = MiscDB.get(settingsKey);
    try {
        const parsed: unknown = JSON.parse(raw ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const record = parsed as Record<string, unknown>;
            return normalizeNsfwClassifySettings(
                record[NSFW_CLASSIFY_SETTINGS_KEY] as Partial<NsfwClassifySettings> | undefined,
            );
        }
    } catch {
        // Fall through to defaults.
    }
    return normalizeNsfwClassifySettings(undefined);
}
