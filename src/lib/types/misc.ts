
export const sortingMethods = ['date', 'date (asc)', 'name', 'name (desc)', 'random'] as const;
export type SortingMethod = typeof sortingMethods[number];

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

const matchTypes = ['all', 'positive', 'negative', 'params', 'folder'] as const;
export type MatchType = typeof matchTypes[number];
export function isMatchType(object: any): object is MatchType {
    return matchTypes.includes(object);
}

export const searchKeywords = ['AND', 'NOT', 'ALL', 'NEGATIVE|NEG', 'FOLDER|FD', 'PARAMS|PR'] as const;
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