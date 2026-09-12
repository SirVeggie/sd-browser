export type AutocompleteBoundary = 'comma' | 'word';

export type AutocompleteSource = {
    id: string;
    name: string;
    path: string;
    enabledByDefault: boolean;
    boundary: AutocompleteBoundary;
    position: number;
    itemCount: number;
    error: string | null;
    updatedAt: number;
};

export type AutocompleteBehaviorSettings = {
    autoSuggest: boolean;
    showInfo: boolean;
    /** Missing in older localStorage blobs means on. */
    idleFade?: boolean;
    minChars: number;
    maxRows: number;
    idleOpacity: number;
    fadeDelayMs: number;
};

export const defaultAutocompleteBehavior: AutocompleteBehaviorSettings = {
    autoSuggest: true,
    showInfo: true,
    idleFade: true,
    minChars: 3,
    maxRows: 50,
    idleOpacity: 0.22,
    fadeDelayMs: 2000,
};

export type AutocompleteSearchQuery = {
    text: string;
    replaceStart: number;
    replaceEnd: number;
};

export type AutocompleteSourceSearch = {
    sourceId: string;
    queries: AutocompleteSearchQuery[];
};

export type AutocompleteMatch = {
    sourceId: string;
    value: string;
    aliases: string[];
    info: string;
    /** Popularity / booru count; missing is treated as 0. */
    score?: number;
    matchedText: string;
    matchedAlias: boolean;
    query: string;
    replaceStart: number;
    replaceEnd: number;
};
