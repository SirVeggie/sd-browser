import type { SortingMethod } from "$lib/types/misc";

export type SimilaritySortState = {
    active: boolean;
    savedSorting?: SortingMethod;
};

export function isSimilaritySorting(
    sorting: SortingMethod,
): sorting is "similar" | "similar (inverse)" {
    return sorting === "similar" || sorting === "similar (inverse)";
}

export function transitionSimilaritySort(
    sorting: SortingMethod,
    state: SimilaritySortState,
    nextActive: boolean,
): { sorting: SortingMethod; state: SimilaritySortState } {
    if (!state.active && nextActive) {
        return {
            sorting: "similar",
            state: { active: true, savedSorting: sorting },
        };
    }

    if (state.active && !nextActive) {
        return {
            sorting: state.savedSorting ?? "date",
            state: { active: false },
        };
    }

    return {
        sorting,
        state: { ...state, active: nextActive },
    };
}

export function orderIdsBySimilarityScore(
    scores: ReadonlyMap<string, number>,
    sorting: "similar" | "similar (inverse)",
): string[] {
    return [...scores.entries()]
        .sort((a, b) => sorting === "similar" ? b[1] - a[1] : a[1] - b[1])
        .map(([id]) => id);
}
