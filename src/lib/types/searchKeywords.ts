export const searchKeywords = [
    'AND',
    'NOT',
    'ALL',
    'NEGATIVE|NEG',
    'FOLDER|FD',
    'PARAMS|PR',
    'DATE|DT',
    'MODEL|MD',
    'ANNOTATION|AN',
    'TAG',
    'SIMILAR|SM',
    'IMG',
    'ID',
    'VIDEO|VID',
    'SKIP',
    'TAKE',
] as const;

export type SearchKeyword = typeof searchKeywords[number];

export function isSearchKeyword(object: unknown): object is SearchKeyword {
    return typeof object === 'string' && (searchKeywords as readonly string[]).includes(object);
}
