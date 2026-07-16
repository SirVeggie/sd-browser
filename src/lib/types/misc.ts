
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

export const searchKeywords = ['AND', 'NOT', 'ALL', 'NEGATIVE|NEG', 'FOLDER|FD', 'PARAMS|PR', 'DATE|DT', 'MODEL|MD', 'ANNOTATION|AN', 'TAG', 'SIMILAR|SM', 'IMG', 'ID', 'VIDEO|VID', 'SKIP', 'TAKE', 'MMR', 'IMGSIM'] as const;
export type SearchKeyword = typeof searchKeywords[number];
export function isSearchKeyword(object: any): object is SearchKeyword {
    return searchKeywords.includes(object);
}

export type SearchKeywordHelp = {
    keyword: SearchKeyword;
    summary: string;
    details: string;
    example: string;
};

export const searchKeywordHelp = [
    {
        keyword: 'AND',
        summary: 'Separates search clauses.',
        details: 'Use AND when you want to start another clause, especially before another keyword. Each clause must match for an image to stay in the results.',
        example: 'cat AND FOLDER favorites',
    },
    {
        keyword: 'NOT',
        summary: 'Excludes matches for the next clause.',
        details: 'Put NOT before any other keyword or text clause to invert it.',
        example: 'cat AND NOT TAG hidden',
    },
    {
        keyword: 'ALL',
        summary: 'Searches across all stored metadata.',
        details: 'Matches prompt, workflow, extra metadata, and folder text instead of only the positive prompt.',
        example: 'ALL sampler_name',
    },
    {
        keyword: 'NEGATIVE|NEG',
        summary: 'Searches the negative prompt.',
        details: 'NEG is the short alias for NEGATIVE.',
        example: 'NEG low quality',
    },
    {
        keyword: 'FOLDER|FD',
        summary: 'Searches the image folder path.',
        details: 'Useful for narrowing results to a directory or path fragment. FD is the short alias.',
        example: 'FD portraits',
    },
    {
        keyword: 'PARAMS|PR',
        summary: 'Searches generation parameters.',
        details: 'Matches parameter text such as sampler, steps, seed, or other metadata stored with the image. PR is the short alias.',
        example: 'PR steps: 30',
    },
    {
        keyword: 'DATE|DT',
        summary: 'Filters by modified date.',
        details: 'Supports absolute dates, timestamps, relative offsets like -7d, and ranges with TO. DT is the short alias.',
        example: 'DT 2026.07.01 TO 2026.07.12',
    },
    {
        keyword: 'MODEL|MD',
        summary: 'Searches detected model names.',
        details: 'Matches the model list extracted from image metadata. MD is the short alias.',
        example: 'MD pony',
    },
    {
        keyword: 'ANNOTATION|AN',
        summary: 'Searches local annotations.',
        details: 'Only checks annotation text saved in this app. AN is the short alias.',
        example: 'AN favorite lighting',
    },
    {
        keyword: 'TAG',
        summary: 'Searches image tags.',
        details: 'Matches assigned tags. Exact tag names are checked directly when the term is written as an exact tag.',
        example: 'TAG landscape',
    },
    {
        keyword: 'SIMILAR|SM',
        summary: 'Finds images similar to another image.',
        details: 'Use an image id after the keyword to compare prompt text. A trailing number can override the similarity threshold.',
        example: 'SM abc123 0.6',
    },
    {
        keyword: 'IMG',
        summary: 'Uses image embeddings.',
        details: 'With no text, matches images that have embeddings. With text, runs an embedding search. A 64-character hex image id uses that image\'s embedding instead of text. Multi-image modes: avg (centroid), all (match every ref), any (match any ref), more <A> <B> (extrapolate past A away from B), fringe (related but atypical). Mode form: IMG avg <id> <id>… — space-separated ids, no +. Mix image ids and text with spaced + and - (positive and negative weights); a leading spaced - works for negative-only queries. Prefix text with ~ to skip the search template. Trailing decimals set the similarity threshold; trailing integers limit result count. Both can be used together in either order. Use -1 as k to force full JavaScript scoring while keeping a threshold.',
        example: 'IMG avg <id1> <id2> 0.8',
    },
    {
        keyword: 'ID',
        summary: 'Matches specific image ids.',
        details: 'Use one or more image ids to pin the search to those images.',
        example: 'ID abc123 def456',
    },
    {
        keyword: 'VIDEO|VID',
        summary: 'Filters videos.',
        details: 'Matches images whose file type is detected as video. VID is the short alias.',
        example: 'VID',
    },
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
        details: 'Use a result count, with an optional candidate count. Requires embeddings and ranks for uniqueness/diversity within the current matches.',
        example: 'cat AND MMR 100 1000',
    },
    {
        keyword: 'IMGSIM',
        summary: 'Fills remaining results by image similarity.',
        details: 'Use a result count. It expands from positive IMG matches using image embeddings.',
        example: 'IMG red dress AND IMGSIM 200',
    },
] satisfies readonly SearchKeywordHelp[];

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