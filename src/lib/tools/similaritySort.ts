import type { SortingMethod } from "$lib/types/misc";

export type SimilaritySortState = {
    active: boolean;
    savedSorting?: SortingMethod;
};

export type UniquenessSortState = {
    active: boolean;
    savedSorting?: SortingMethod;
};

export type TemporarySortState = {
    similarity: SimilaritySortState;
    uniqueness: UniquenessSortState;
};

export function isSimilaritySorting(
    sorting: SortingMethod,
): sorting is "similar" | "similar (inverse)" {
    return sorting === "similar" || sorting === "similar (inverse)";
}

export function isUniquenessSorting(sorting: SortingMethod): sorting is "uniqueness" {
    return sorting === "uniqueness";
}

export function isTemporarySorting(sorting: SortingMethod): boolean {
    return isSimilaritySorting(sorting) || isUniquenessSorting(sorting);
}

export function transitionSimilaritySort(
    sorting: SortingMethod,
    state: SimilaritySortState,
    nextActive: boolean,
): { sorting: SortingMethod; state: SimilaritySortState } {
    if (!state.active && nextActive) {
        const enteringFresh = !isTemporarySorting(sorting);
        return {
            sorting: enteringFresh ? "similar" : sorting,
            state: {
                active: true,
                savedSorting: enteringFresh ? sorting : state.savedSorting ?? sorting,
            },
        };
    }

    if (state.active && !nextActive) {
        return {
            sorting: isSimilaritySorting(sorting)
                ? (state.savedSorting ?? "date")
                : sorting,
            state: { active: false },
        };
    }

    return {
        sorting,
        state: { ...state, active: nextActive },
    };
}

export function transitionUniquenessSort(
    sorting: SortingMethod,
    state: UniquenessSortState,
    nextActive: boolean,
): { sorting: SortingMethod; state: UniquenessSortState } {
    if (!state.active && nextActive) {
        const enteringFresh = !isTemporarySorting(sorting);
        return {
            sorting: enteringFresh ? "uniqueness" : sorting,
            state: {
                active: true,
                savedSorting: enteringFresh ? sorting : state.savedSorting ?? sorting,
            },
        };
    }

    if (state.active && !nextActive) {
        return {
            sorting: isUniquenessSorting(sorting)
                ? (state.savedSorting ?? "date")
                : sorting,
            state: { active: false },
        };
    }

    return {
        sorting,
        state: { ...state, active: nextActive },
    };
}

export function syncTemporarySorts(
    sorting: SortingMethod,
    state: TemporarySortState,
    options: { hasSimilarity: boolean; hasUniqueness: boolean },
): { sorting: SortingMethod; state: TemporarySortState } {
    const similarityResult = transitionSimilaritySort(
        sorting,
        state.similarity,
        options.hasSimilarity,
    );
    const uniquenessResult = transitionUniquenessSort(
        similarityResult.sorting,
        state.uniqueness,
        options.hasUniqueness,
    );

    return {
        sorting: uniquenessResult.sorting,
        state: {
            similarity: similarityResult.state,
            uniqueness: uniquenessResult.state,
        },
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

export function orderIdsByUniquenessScore(
    scores: ReadonlyMap<string, number>,
): string[] {
    return [...scores.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([id]) => id);
}

export function orderIdsByMmrSequence(
    orderedIds: readonly string[],
): string[] {
    return [...orderedIds];
}
