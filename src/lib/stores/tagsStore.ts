import { syncMemory } from "$lib/tools/syncStorage";
import { reorderItems } from "$lib/tools/sortableGeometry";
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

export function reorderTagDefinitions(
    registry: TagsRegistryState,
    fromIndex: number,
    toIndex: number,
): TagsRegistryState {
    return { tags: reorderItems(registry.tags, fromIndex, toIndex) };
}

export function reorderTagDefinitionsByNames(
    registry: TagsRegistryState,
    namesInOrder: string[],
): TagsRegistryState {
    const byName = new Map(registry.tags.map((tag) => [tag.name, tag]));
    const tags: TagDefinition[] = [];
    for (const name of namesInOrder) {
        const tag = byName.get(name);
        if (tag) {
            tags.push(tag);
            byName.delete(name);
        }
    }
    for (const tag of byName.values()) tags.push(tag);
    return { tags };
}
