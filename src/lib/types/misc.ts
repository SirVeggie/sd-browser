
export const sortingMethods = ['date', 'date (asc)', 'name', 'name (desc)', 'random'] as const;
export type SortingMethod = typeof sortingMethods[number];
export function isSortingMethod(object: any): object is SortingMethod {
    return sortingMethods.includes(object);
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

export const qualityModes = ['original', 'medium', 'low'] as const;
export type QualityMode = typeof qualityModes[number];
export function isQualityMode(object: any): object is QualityMode {
    return qualityModes.includes(object);
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

const matchTypes = ['all', 'positive', 'negative', 'params', 'folder', 'date', 'model', 'annotation', 'similar'] as const;
export type MatchType = typeof matchTypes[number];
export function isMatchType(object: any): object is MatchType {
    return matchTypes.includes(object);
}

export const searchKeywords = ['AND', 'NOT', 'ALL', 'NEGATIVE|NEG', 'FOLDER|FD', 'PARAMS|PR', 'DATE|DT', 'MODEL|MD', 'ANNOTATION|AN', 'SIMILAR|SM', 'SKIP'] as const;
export type SearchKeyword = typeof searchKeywords[number];
export function isSearchKeyword(object: any): object is SearchKeyword {
    return searchKeywords.includes(object);
}

export type GlobalSettings = {
    nsfwFilter: string;
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