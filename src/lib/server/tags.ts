import { DEFAULT_TAGS_REGISTRY, type BulkTagMode, type TagDefinition, type TagsRegistryState } from '$lib/types/tags';
import { MetaCalcDB, MiscDB } from './db';
import { getImage, refreshExtradataInMemory } from './dataIndex';
import { notifyMetadataChange } from './imageChangeHub';

const settingsKey = 'settings';

function isTagDefinition(value: unknown): value is TagDefinition {
    if (!value || typeof value !== 'object')
        return false;
    const record = value as Record<string, unknown>;
    return typeof record.name === 'string' && typeof record.color === 'string';
}

function isTagsRegistryState(value: unknown): value is TagsRegistryState {
    if (!value || typeof value !== 'object')
        return false;
    const record = value as Record<string, unknown>;
    return Array.isArray(record.tags) && record.tags.every(isTagDefinition);
}

function readSettings(): Record<string, unknown> {
    const raw = MiscDB.get(settingsKey);
    try {
        const parsed: unknown = JSON.parse(raw ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            return parsed as Record<string, unknown>;
    } catch {
        // Fall through to empty settings.
    }
    return {};
}

export function ensureDefaultTagsRegistry(): void {
    const settings = readSettings();
    if (settings.tags)
        return;
    settings.tags = DEFAULT_TAGS_REGISTRY;
    MiscDB.set(settingsKey, JSON.stringify(settings));
}

function removeTagFromRegistry(tagName: string): void {
    const settings = readSettings();
    if (!isTagsRegistryState(settings.tags))
        return;
    const tags = settings.tags.tags.filter((tag) => tag.name !== tagName);
    if (tags.length === settings.tags.tags.length)
        return;
    settings.tags = { tags };
    MiscDB.set(settingsKey, JSON.stringify(settings));
}

export function setImageTags(id: string, tags: string[]): void {
    MetaCalcDB.setTags(id, tags);
    const image = getImage(id);
    if (image)
        image.tags = tags;
    notifyMetadataChange(id);
}

export function removeTagFromAllImages(tagName: string): number {
    removeTagFromRegistry(tagName);
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
