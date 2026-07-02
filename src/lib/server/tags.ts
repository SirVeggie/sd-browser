import { DEFAULT_TAGS_REGISTRY, type BulkTagMode } from '$lib/types/tags';
import { MetaCalcDB, MiscDB } from './db';
import { getImage, refreshExtradataInMemory } from './dataIndex';

const settingsKey = 'settings';

export function ensureDefaultTagsRegistry(): void {
    const raw = MiscDB.get(settingsKey);
    const settings = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    if (settings.tags)
        return;
    settings.tags = DEFAULT_TAGS_REGISTRY;
    MiscDB.set(settingsKey, JSON.stringify(settings));
}

export function setImageTags(id: string, tags: string[]): void {
    MetaCalcDB.setTags(id, tags);
    const image = getImage(id);
    if (image)
        image.tags = tags;
}

export function removeTagFromAllImages(tagName: string): number {
    const updated = MetaCalcDB.removeTagFromAll(tagName);
    refreshExtradataInMemory();
    return updated;
}

export function bulkUpdateImageTags(ids: string[], mode: BulkTagMode, tagNames: string[]): void {
    MetaCalcDB.bulkUpdateTags(ids, mode, tagNames);
    for (const id of ids) {
        const image = getImage(id);
        if (!image)
            continue;
        const data = MetaCalcDB.get(id);
        if (data)
            image.tags = data.tags ?? [];
    }
}
