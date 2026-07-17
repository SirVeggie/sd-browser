
import type { CustomFiltersState } from "$lib/stores/customFiltersStore";
import type { TagsRegistryState } from "$lib/types/tags";

export const sortingMethods = ['date', 'date (asc)', 'name', 'name (desc)', 'random'] as const;
export const similaritySortingMethods = ['similar', 'similar (inverse)'] as const;
export const uniquenessSortingMethods = ['uniqueness'] as const;
export const temporarySortingMethods = [...similaritySortingMethods, ...uniquenessSortingMethods] as const;
export type SortingMethod = typeof sortingMethods[number] | typeof temporarySortingMethods[number];
export function isSortingMethod(object: any): object is SortingMethod {
    return sortingMethods.includes(object)
        || similaritySortingMethods.includes(object)
        || uniquenessSortingMethods.includes(object);
}

export const searchModes = ['regex', 'words', 'contains'] as const;
export type SearchMode = typeof searchModes[number];
export function isSearchMode(object: any): object is SearchMode {
    return searchModes.includes(object);
}

export const flyoutModes = ['normal', 'wide', 'half', 'fullscreen'] as const;
export type FlyoutMode = typeof flyoutModes[number];
export function isFlyoutMode(object: any): object is FlyoutMode {
    return flyoutModes.includes(object);
}

export const qualityModes = ['original', 'medium', 'low', 'minimal'] as const;
export type QualityMode = typeof qualityModes[number];
export type GeneratedQualityMode = Exclude<QualityMode, 'original'>;
export function isQualityMode(object: any): object is QualityMode {
    return qualityModes.includes(object);
}
export function isGeneratedQualityMode(mode: QualityMode): mode is GeneratedQualityMode {
    return mode !== 'original';
}

export const explorationModes = ['none', 'unique', 'similar', 'sparse'] as const;
export type ExplorationMode = typeof explorationModes[number];
export function isExplorationMode(object: any): object is ExplorationMode {
    return explorationModes.includes(object);
}

export function coerceExplorationMode(mode: unknown): ExplorationMode {
    if (typeof mode === 'string' && isExplorationMode(mode))
        return mode;
    return defaultExplorationSettings.explorationMode;
}

export const similarityAlgorithms = ['token-jaccard', 'token-cosine'] as const;
export type SimilarityAlgorithm = typeof similarityAlgorithms[number];
export function isSimilarityAlgorithm(object: any): object is SimilarityAlgorithm {
    return similarityAlgorithms.includes(object);
}

export type ExplorationSettings = {
    explorationMode: ExplorationMode;
    sparseFrequency: number;
    similarityAlgorithm: SimilarityAlgorithm;
    similarityThreshold: number;
};

export const defaultExplorationSettings: ExplorationSettings = {
    explorationMode: 'none',
    sparseFrequency: 25,
    similarityAlgorithm: 'token-jaccard',
    similarityThreshold: 0.5,
};

const matchTypes = ['all', 'positive', 'negative', 'params', 'folder', 'date', 'model', 'annotation', 'tag', 'similar', 'img', 'id', 'video'] as const;
export type MatchType = typeof matchTypes[number];
export function isMatchType(object: any): object is MatchType {
    return matchTypes.includes(object);
}

export const searchKeywords = ['AND', 'NOT', 'ALL', 'NEGATIVE|NEG', 'FOLDER|FD', 'PARAMS|PR', 'DATE|DT', 'MODEL|MD', 'ANNOTATION|AN', 'TAG', 'SIMILAR|SM', 'IMG', 'ID', 'VIDEO|VID', 'SKIP', 'TAKE', 'MMR', 'PRUNE'] as const;
export type SearchKeyword = typeof searchKeywords[number];
export function isSearchKeyword(object: any): object is SearchKeyword {
    return searchKeywords.includes(object);
}

/** Help card for a search keyword or IMG mode. Expandable when `details` is set. */
export type SearchKeywordHelpEntry = {
    /** Display tokens shown as code chips, joined with `|` for aliases. */
    keyword: string;
    summary: string;
    /** Longer explanation shown when the card is expanded. Omit when summary is enough. */
    details?: string;
    example: string;
};

export type SearchKeywordHelpSection = {
    title: string;
    entries: readonly SearchKeywordHelpEntry[];
};

export const searchKeywordHelpSections = [
    {
        title: 'Clauses',
        entries: [
            {
                keyword: 'AND',
                summary: 'Separates search clauses.',
                details:
                    'Start a new clause with AND, especially before another keyword. Every clause must match for an image to stay in the results.',
                example: 'cat AND FOLDER favorites',
            },
            {
                keyword: 'NOT',
                summary: 'Excludes matches for the next clause.',
                details: 'Put NOT before any keyword or text clause to invert that clause.',
                example: 'cat AND NOT TAG hidden',
            },
        ],
    },
    {
        title: 'Text and metadata',
        entries: [
            {
                keyword: 'ALL',
                summary: 'Searches across all stored metadata.',
                details:
                    'Matches prompt, workflow, extra metadata, and folder text instead of only the positive prompt.',
                example: 'ALL sampler_name',
            },
            {
                keyword: 'NEGATIVE|NEG',
                summary: 'Searches the negative prompt.',
                details: 'Matches text in the negative prompt field instead of the positive prompt.',
                example: 'NEG low quality',
            },
            {
                keyword: 'FOLDER|FD',
                summary: 'Searches the image folder path.',
                details: 'Narrow results to a directory or path fragment.',
                example: 'FD portraits',
            },
            {
                keyword: 'PARAMS|PR',
                summary: 'Searches generation parameters.',
                details: 'Matches parameter text such as sampler, steps, seed, or other metadata stored with the image.',
                example: 'PR steps: 30',
            },
            {
                keyword: 'DATE|DT',
                summary: 'Filters by modified date.',
                details:
                    'Supports absolute dates, timestamps, relative offsets like -7d, and ranges with TO.',
                example: 'DT 2026.07.01 TO 2026.07.12',
            },
            {
                keyword: 'MODEL|MD',
                summary: 'Searches detected model names.',
                details: 'Matches the model list extracted from image metadata.',
                example: 'MD pony',
            },
            {
                keyword: 'ANNOTATION|AN',
                summary: 'Searches local annotations.',
                details: 'Only checks annotation text saved in this app.',
                example: 'AN favorite lighting',
            },
            {
                keyword: 'TAG',
                summary: 'Searches image tags.',
                details:
                    'Matches assigned tags. Exact tag names are checked directly when the term is written as an exact tag.',
                example: 'TAG landscape',
            },
            {
                keyword: 'VIDEO|VID',
                summary: 'Filters videos.',
                details: 'Keeps only files detected as video.',
                example: 'VID',
            },
            {
                keyword: 'ID',
                summary: 'Matches specific image ids.',
                details: 'Use one or more image ids to pin the search to those images.',
                example: 'ID abc123 def456',
            },
        ],
    },
    {
        title: 'Similarity',
        entries: [
            {
                keyword: 'SIMILAR|SM',
                summary: 'Finds images with similar prompts.',
                details:
                    'Pass an image reference (#n or [n]) or image id to compare prompt text. A trailing number overrides the similarity threshold. This is prompt-only; use IMG for embedding similarity.',
                example: 'SM #1 0.6',
            },
        ],
    },
    {
        title: 'Image modes',
        entries: [
            {
                keyword: 'IMG',
                summary: 'Searches with image embeddings.',
                details:
                    'Bare IMG matches images that have embeddings. Text runs an embedding search. A 64-character hex id uses that image\'s embedding. Use #n or [n] for reference-strip slots (e.g. IMG #1 0.8). Mix ids and text with spaced + and - for positive and negative weights; a leading spaced - is negative-only. Prefix text with ~ to skip the search template. Trailing decimals set the similarity threshold; trailing integers limit result count (either order). Use -1 as k to return all embedded matches sorted by score without threshold filtering. Named multi-image modes are listed below.',
                example: 'IMG cat + #1 - beach 0.8',
            },
            {
                keyword: 'IMG avg',
                summary: 'Blends reference embeddings into a centroid.',
                details:
                    'Averages the reference image embeddings, renormalizes, then runs nearest-neighbor search. Soft blend of shared traits. Default for multi-select Similar images. Needs one or more hex ids (or #n refs). Space-separated ids, no +.',
                example: 'IMG avg #1 #2 #3 0.8',
            },
            {
                keyword: 'IMG all',
                summary: 'Must resemble every reference.',
                details:
                    'Scores by geometric mean of similarity to each reference (same idea as weighted IMG a + b). Candidates that miss any ref score poorly. Needs one or more hex ids. Inside an IMG clause, all is a mode name, not the ALL metadata keyword.',
                example: 'IMG all #1 #2',
            },
            {
                keyword: 'IMG any',
                summary: 'Matches the closest reference.',
                details:
                    'Uses the maximum similarity to any reference. Good for moodboards or mixed themes where matching one ref is enough. Needs one or more hex ids.',
                example: 'IMG any #1 #2 #3',
            },
            {
                keyword: 'IMG more',
                summary: 'Extrapolates past A away from B.',
                details:
                    'Builds normalize(A + α(A−B)) and searches near that vector. Emphasizes what distinguishes A from B. Requires exactly two ids: IMG more <idA> <idB>. Order matters.',
                example: 'IMG more #1 #2',
            },
            {
                keyword: 'IMG fringe',
                summary: 'Related but atypical vs the set.',
                details:
                    'Prefers images near at least one reference but unlike the set centroid: weird cousins, hybrids, near-misses. Needs one or more hex ids. Mode names only apply when followed by hex ids, so IMG fringe of trees stays a text query.',
                example: 'IMG fringe #1 #2',
            },
            {
                keyword: 'IMG diff',
                summary: 'Searches along the A−B difference.',
                details:
                    'Uses the difference vector between two embeddings. Aligns with what changes from B to A without requiring a match to A itself. Requires exactly two ids. Order matters (A−B ≠ B−A).',
                example: 'IMG diff #1 #2',
            },
            {
                keyword: 'IMG shared',
                summary: 'Keeps stable traits across references.',
                details:
                    'Inverse-variance weights the reference mean: dims that vary a lot within the set are downweighted relative to stable ones, then KNN as usual. Better than avg when refs share a subject but disagree on outfit or lighting. Needs at least two hex ids.',
                example: 'IMG shared #1 #2 #3',
            },
            {
                keyword: 'IMG analogy',
                summary: 'A:B as C:? relational search.',
                details:
                    'Builds normalize(C + (B − A)) and searches near it. Apply the A→B transform to C. Requires exactly three ids: IMG analogy <A> <B> <C>.',
                example: 'IMG analogy #1 #2 #3',
            },
            {
                keyword: 'IMG affinity',
                summary: 'Expands a cohesive reference set.',
                details:
                    'Scores mean similarity to the references, penalizing uneven match (μ / (1 + σ)). Tighter than any on mixed sets, less muddy than avg — prefers collection fits over one-ref specialists. Needs at least two hex ids.',
                example: 'IMG affinity #1 #2 #3',
            },
        ],
    },
    {
        title: 'Result shaping',
        entries: [
            {
                keyword: 'SKIP',
                summary: 'Drops results from the front.',
                details: 'Applied after matching. Use a positive integer to skip that many results.',
                example: 'cat AND SKIP 50',
            },
            {
                keyword: 'TAKE',
                summary: 'Limits the number of results.',
                details: 'Applied after matching. Use a positive integer to keep only that many results.',
                example: 'cat AND TAKE 100',
            },
            {
                keyword: 'MMR',
                summary: 'Returns diverse embedding-ranked results.',
                details:
                    'Use a result count, with an optional candidate count. Requires embeddings and ranks for uniqueness within the current matches.',
                example: 'cat AND MMR 100 1000',
            },
            {
                keyword: 'PRUNE',
                summary: 'Prunes by image-embedding uniqueness.',
                details:
                    'Use a result count. After ordinary filters and IMG clauses, keeps embedded matches and repeatedly drops near-duplicates in time order until the count remains.',
                example: 'IMG red dress AND PRUNE 200',
            },
        ],
    },
] as const satisfies readonly SearchKeywordHelpSection[];

export type GlobalSettings = {
    nsfwFilter: string;
    customFilters?: CustomFiltersState;
    tags?: TagsRegistryState;
}

export type InputEvent = MouseEvent | KeyboardEvent | TouchEvent;
export type PCEvent = MouseEvent | KeyboardEvent;

export function testType(object: any, keylist: (string | ((o: any) => boolean))[]) {
    for (const key of keylist) {
        if (typeof key === 'string' && !(key in object))
            return false;
        if (typeof key === 'function' && !key(object))
            return false;
        if (typeof key !== 'string' && typeof key !== 'function')
            return false;
    }
    return true;
}

export function testp(key: string, check?: string | (() => boolean)) {
    return (object: any) => {
        if (!(key in object))
            return false;
        if (typeof check === 'string')
            return typeof object[key] === check;
        return check?.() ?? true;
    };
}