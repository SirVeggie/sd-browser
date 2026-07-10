export const mmrCandidatePoolStrategies = ['n-select', 'index', 'pre-rank'] as const;
export type MmrCandidatePoolStrategy = typeof mmrCandidatePoolStrategies[number];

export function isMmrCandidatePoolStrategy(value: unknown): value is MmrCandidatePoolStrategy {
    return typeof value === 'string' && mmrCandidatePoolStrategies.includes(value as MmrCandidatePoolStrategy);
}

export type MmrSettings = {
    /** How the MMR candidate pool is chosen from the current match set. */
    candidatePoolStrategy: MmrCandidatePoolStrategy;
    /** Blend weight λ for intrinsic uniqueness vs redundancy penalty (0–1). */
    diversityWeight: number;
};

export const mmrSettingsDefaults: MmrSettings = {
    candidatePoolStrategy: 'n-select',
    diversityWeight: 0.5,
};

export const MMR_DEFAULT_CANDIDATE_MULTIPLIER = 10;
export const MMR_MAX_RESULT_COUNT = 5000;
export const MMR_MAX_CANDIDATE_COUNT = 50_000;

export function normalizeMmrSettings(stored: Partial<MmrSettings> | undefined): MmrSettings {
    if (!stored) {
        return { ...mmrSettingsDefaults };
    }

    return {
        candidatePoolStrategy: isMmrCandidatePoolStrategy(stored.candidatePoolStrategy)
            ? stored.candidatePoolStrategy
            : mmrSettingsDefaults.candidatePoolStrategy,
        diversityWeight: typeof stored.diversityWeight === 'number'
            && Number.isFinite(stored.diversityWeight)
            && stored.diversityWeight >= 0
            && stored.diversityWeight <= 1
            ? stored.diversityWeight
            : mmrSettingsDefaults.diversityWeight,
    };
}

export type { ParsedMmrDirective } from '$lib/tools/searchParsing';

export function resolveMmrCandidateCount(resultCount: number, explicit?: number): number {
    const candidateCount = explicit ?? resultCount * MMR_DEFAULT_CANDIDATE_MULTIPLIER;
    return Math.min(Math.max(1, candidateCount), MMR_MAX_CANDIDATE_COUNT);
}
