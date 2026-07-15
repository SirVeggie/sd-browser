import type { BulkTagMode } from "$lib/stores/bulkStore";

export type QuickTagHistoryEntry = {
    imageId: string;
    originalTags: string[];
    newTags: string[];
    /** Canonical gallery position before this image was hidden. */
    position: number;
};

export const QUICK_TAG_COOLDOWN_MS = 150;
export const QUICK_TAG_SELECTED_TAGS_STORAGE_KEY = "quickTagSelectedTags";

export function loadQuickTagSelectedTags(storage: Storage): string[] {
    const raw = storage.getItem(QUICK_TAG_SELECTED_TAGS_STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.every((tag) => typeof tag === "string")) {
            return [];
        }
        return [...new Set(parsed)];
    } catch {
        return [];
    }
}

export function saveQuickTagSelectedTags(
    storage: Storage,
    selectedTags: string[],
) {
    storage.setItem(
        QUICK_TAG_SELECTED_TAGS_STORAGE_KEY,
        JSON.stringify(selectedTags),
    );
}

export function computeQuickTagResult(
    originalTags: string[],
    selectedTags: string[],
    mode: BulkTagMode,
): string[] {
    switch (mode) {
        case "add":
            return [...new Set([...originalTags, ...selectedTags])];
        case "remove":
            return originalTags.filter((tag) => !selectedTags.includes(tag));
        case "replace":
            return [...selectedTags];
        default: {
            const _exhaustive: never = mode;
            return _exhaustive;
        }
    }
}
