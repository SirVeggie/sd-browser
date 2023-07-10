
export type ImageList = Map<string, ServerImage>;

export const sortingMethods = ['date', 'name', 'random'] as const;
export type SortingMethod = typeof sortingMethods[number];

export type ServerImage = {
    id: string;
    file: string;
    folder: string;
    modifiedDate: number;
    createdDate: number;
    prompt?: string;
};
export function isServerImage(object: any): object is ServerImage {
    return testType(object, ['id', 'file', 'metadata']);
}

export type ClientImage = {
    id: string;
    url: string;
};
export function isClientImage(object: any): object is ClientImage {
    return testType(object, ['id', 'url']);
}

export type ImageInfo = {
    id: string;
    folder: string;
    modifiedDate: number;
    createdDate: number;
    prompt?: string;
};
export function isImageInfo(object: any): object is ImageInfo {
    return testType(object, ['id', 'folder', 'modifiedDate', 'createdDate']);
}

export const searchModes = ['contains', 'regex'] as const;
export type SearchMode = typeof searchModes[number];
export function isSearchMode(object: any): object is SearchMode {
    return searchModes.includes(object);
}

export type ImageRequest = {
    search: string;
    latestId: string;
    oldestId: string;
    matching: SearchMode;
    sorting: SortingMethod;
    collapse: boolean;
};
export function isImageRequest(object: any): object is ImageRequest {
    return testType(object, ['search', 'latestId', 'oldestId', 'sorting', 'collapse']);
}

export type ImageResponse = {
    imageIds: string[];
    amount: number;
};
export function isImageResponse(object: any): object is ImageResponse {
    return testType(object, ['imageIds', 'amount']);
}

export type ServerError = {
    error: string;
    [key: string]: unknown;
};
export function isServerError(object: any): object is ServerError {
    return testType(object, ['error']);
}

export type ServerMessage = {
    message: string;
    [key: string]: unknown;
};
export function isServerMessage(object: any): object is ServerMessage {
    return testType(object, ['message']);
}

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