import { syncMemory } from "$lib/tools/syncStorage";
import { reorderItems } from "$lib/tools/sortableGeometry";
import { get, writable } from "svelte/store";

export type CustomFilter = {
    id: string;
    name: string;
    filter: string;
};

export type CustomFiltersState = {
    filters: CustomFilter[];
};

export const BUILTIN_FOLDERS_ID = "builtin-folders";
export const folderFilterDefault = "NOT FOLDER img2img|grids|extras";

export function createDefaultFoldersFilter(filter = folderFilterDefault): CustomFilter {
    return { id: BUILTIN_FOLDERS_ID, name: "Folders", filter };
}

const defaultCustomFilters: CustomFiltersState = {
    filters: [],
};

export const customFiltersStore = writable<CustomFiltersState>({ ...defaultCustomFilters });
export const activeCustomFilterIds = writable<string[]>([]);

export function syncCustomFiltersWithLocalStorage() {
    syncMemory("customFilters", customFiltersStore, true);
    syncMemory("activeCustomFilterIds", activeCustomFilterIds);
}

export function getActiveCustomFilterStrings(): string[] {
    const ids = get(activeCustomFilterIds);
    const { filters } = get(customFiltersStore);
    const strings: string[] = [];
    for (const id of ids) {
        const entry = filters.find((f) => f.id === id);
        if (entry?.filter) strings.push(entry.filter);
    }
    return strings;
}

export function reorderCustomFilters(
    state: CustomFiltersState,
    fromIndex: number,
    toIndex: number,
): CustomFiltersState {
    return { filters: reorderItems(state.filters, fromIndex, toIndex) };
}

export function reorderCustomFiltersByIds(
    state: CustomFiltersState,
    idsInOrder: string[],
): CustomFiltersState {
    const byId = new Map(state.filters.map((filter) => [filter.id, filter]));
    const filters: CustomFilter[] = [];
    for (const id of idsInOrder) {
        const filter = byId.get(id);
        if (filter) {
            filters.push(filter);
            byId.delete(id);
        }
    }
    for (const filter of byId.values()) filters.push(filter);
    return { filters };
}
