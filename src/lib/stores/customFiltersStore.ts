import { syncMemory } from "$lib/tools/syncStorage";
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
    filters: [createDefaultFoldersFilter()],
};

export const customFiltersStore = writable<CustomFiltersState>({ ...defaultCustomFilters });
export const activeCustomFilterIds = writable<string[]>([BUILTIN_FOLDERS_ID]);

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
