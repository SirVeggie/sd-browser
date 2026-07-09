import type { BulkTagMode } from "$lib/stores/bulkStore";

export type QuickTagHistoryEntry = {
    imageId: string;
    originalTags: string[];
    newTags: string[];
};

export const QUICK_TAG_COOLDOWN_MS = 150;

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
