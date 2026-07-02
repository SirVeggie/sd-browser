import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";
import type { TagDefinition, TagsRegistryState } from "$lib/types/tags";

const emptyTagsRegistry: TagsRegistryState = { tags: [] };

export const tagsStore = writable<TagsRegistryState>({ ...emptyTagsRegistry });

export function syncTagsWithLocalStorage() {
    syncMemory("tags", tagsStore, true);
}

export function getTagColor(registry: TagsRegistryState, name: string): string | undefined {
    return registry.tags.find((tag) => tag.name === name)?.color;
}

export function upsertTagDefinition(registry: TagsRegistryState, definition: TagDefinition): TagsRegistryState {
    const existing = registry.tags.findIndex((tag) => tag.name === definition.name);
    if (existing >= 0) {
        const tags = [...registry.tags];
        tags[existing] = definition;
        return { tags };
    }
    return { tags: [...registry.tags, definition] };
}

export function removeTagDefinition(registry: TagsRegistryState, name: string): TagsRegistryState {
    return { tags: registry.tags.filter((tag) => tag.name !== name) };
}
