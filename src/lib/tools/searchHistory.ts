import type { SearchParams } from "$lib/stores/searchStore";
import type { SortingMethod } from "$lib/types/misc";

export const maxSearchHistoryEntries = 20;

export type SearchHistorySnapshot = {
    kind: "search";
    id: string;
    searchInput: string;
    params: SearchParams;
    sorting: SortingMethod;
    sessionId: string;
    currentAmount: number;
    oldestImageId: string;
    anchorImageId: string;
    scrollY: number;
};

export type SearchHistoryState =
    | { kind: "baseline"; searchHistory: true }
    | { kind: "search"; searchHistory: true; snapshot: SearchHistorySnapshot }
    | { kind: "overlay"; searchHistory: true; overlay: OverlayKind };

export type OverlayKind = "selection" | "bulk" | "quick-tag-setup" | "quick-tag";

export function isSearchHistoryState(value: unknown): value is SearchHistoryState {
    if (!value || typeof value !== "object") return false;
    if (!("searchHistory" in value) || value.searchHistory !== true) return false;
    if (!("kind" in value)) return false;

    switch (value.kind) {
        case "baseline":
            return true;
        case "search":
            return "snapshot" in value && isSearchHistorySnapshot(value.snapshot);
        case "overlay":
            return "overlay" in value && isOverlayKind(value.overlay);
        default:
            return false;
    }
}

export function isSearchHistorySnapshot(value: unknown): value is SearchHistorySnapshot {
    if (!value || typeof value !== "object") return false;
    return (
        "kind" in value
        && value.kind === "search"
        && "id" in value
        && typeof value.id === "string"
        && "searchInput" in value
        && typeof value.searchInput === "string"
        && "sessionId" in value
        && typeof value.sessionId === "string"
        && "currentAmount" in value
        && typeof value.currentAmount === "number"
        && "oldestImageId" in value
        && typeof value.oldestImageId === "string"
        && "anchorImageId" in value
        && typeof value.anchorImageId === "string"
        && "scrollY" in value
        && typeof value.scrollY === "number"
        && "params" in value
        && isSearchParams(value.params)
        && "sorting" in value
        && typeof value.sorting === "string"
    );
}

function isOverlayKind(value: unknown): value is OverlayKind {
    return value === "selection"
        || value === "bulk"
        || value === "quick-tag-setup"
        || value === "quick-tag";
}

function isSearchParams(value: unknown): value is SearchParams {
    if (!value || typeof value !== "object") return false;
    return (
        "search" in value
        && typeof value.search === "string"
        && "matching" in value
        && typeof value.matching === "string"
        && "explorationMode" in value
        && typeof value.explorationMode === "string"
        && "sparseFrequency" in value
        && typeof value.sparseFrequency === "number"
        && "similarityAlgorithm" in value
        && typeof value.similarityAlgorithm === "string"
        && "similarityThreshold" in value
        && typeof value.similarityThreshold === "number"
    );
}
