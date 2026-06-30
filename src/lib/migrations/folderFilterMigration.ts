import {
    BUILTIN_FOLDERS_ID,
    createDefaultFoldersFilter,
    folderFilterDefault,
    type CustomFiltersState,
} from "$lib/stores/customFiltersStore";

export const FOLDER_FILTER_MIGRATED_KEY = "folderFilterMigrated";

function readLegacyJson<T>(key: string): T | undefined {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return undefined;
    }
}

export function migrateFolderFilterToCustomFilters(): void {
    if (localStorage.getItem(FOLDER_FILTER_MIGRATED_KEY)) return;
    if (localStorage.getItem("customFilters")) {
        localStorage.setItem(FOLDER_FILTER_MIGRATED_KEY, "true");
        return;
    }

    const legacyFilter = readLegacyJson<string>("folderFilter") ?? folderFilterDefault;
    const legacyMode = readLegacyJson<boolean>("folderMode") ?? true;

    const customFilters: CustomFiltersState = {
        filters: [createDefaultFoldersFilter(legacyFilter)],
    };

    localStorage.setItem("customFilters", JSON.stringify(customFilters));
    localStorage.setItem(
        "activeCustomFilterIds",
        JSON.stringify(legacyMode ? [BUILTIN_FOLDERS_ID] : []),
    );
    localStorage.removeItem("folderFilter");
    localStorage.removeItem("folderMode");
    localStorage.setItem(FOLDER_FILTER_MIGRATED_KEY, "true");
}

export function migratePulledGlobalSettings(
    settings: Record<string, unknown>,
): Record<string, unknown> {
    if (settings.customFilters) return settings;
    if (typeof settings.folderFilter !== "string") return settings;

    const { folderFilter: _legacy, ...rest } = settings;
    return {
        ...rest,
        customFilters: {
            filters: [createDefaultFoldersFilter(_legacy as string)],
        },
    };
}
