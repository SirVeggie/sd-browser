
export type ImageList = Map<string, ServerImage>;

export const sortingMethods = ['date', 'date (asc)', 'name', 'name (desc)', 'random'] as const;
export type SortingMethod = typeof sortingMethods[number];

export type ServerImage = {
    id: string;
    file: string;
    folder: string;
    modifiedDate: number;
    createdDate: number;
    prompt?: string;
    workflow?: string;
    preview?: string;
};
export function isServerImage(object: any): object is ServerImage {
    return testType(object, ['id', 'file', 'folder', 'modifiedDate', 'createdDate']);
}

export type ClientImage = {
    id: string;
    url: string;
    type?: 'image' | 'video';
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
    workflow?: string;
};
export function isImageInfo(object: any): object is ImageInfo {
    return testType(object, ['id', 'folder', 'modifiedDate', 'createdDate']);
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

export type ImageRequest = {
    search: string;
    filters: string[];
    latestId: string;
    oldestId: string;
    matching: SearchMode;
    sorting: SortingMethod;
    collapse: boolean;
    nsfw: boolean;
};
export function isImageRequest(object: any): object is ImageRequest {
    return testType(object, ['search', 'filters', 'latestId', 'oldestId', 'sorting', 'collapse']);
}

export type ImageResponse = {
    images: Omit<ClientImage, 'url'>[];
    amount: number;
    timestamp: number;
};
export function isImageResponse(object: any): object is ImageResponse {
    return testType(object, ['imageIds', 'amount']);
}

export type UpdateRequest = {
    search: string;
    filters: string[];
    matching: SearchMode;
    collapse: boolean;
    timestamp: number;
    nsfw: boolean;
};
export function isUpdateRequest(object: any): object is UpdateRequest {
    return testType(object, ['search', 'filters', 'matching', 'collapse', 'timestamp']);
}

export type UpdateResponse = {
    additions: Omit<ClientImage, 'url'>[];
    deletions: string[];
    timestamp: number;
};
export function isUpdateResponse(object: any): object is UpdateResponse {
    return testType(object, ['additions', 'deletions', 'timestamp']);
}

export type ActionRequest = NsfwAction | FavoriteAction | DeleteAction | OpenAction;
export function isActionRequest(object: any): object is ActionRequest {
    return testType(object, ['type']);
}

export type MultiActionRequest = {
    ids: string[];
} & ActionRequest;
export function isMultiActionRequest(object: any): object is MultiActionRequest {
    return testType(object, ['ids', 'type']);
}

export type NsfwAction = {
    type: 'nsfw';
    state: boolean;
};

export type FavoriteAction = {
    type: 'favorite';
    state: boolean;
};

export type DeleteAction = {
    type: 'delete';
};

export type OpenAction = {
    type: 'open';
};

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

export type ComfyNode = {
    inputs: Record<string, (string|number|boolean|[string, number]|object)>;
    class_type: string;
}
export type ComfyPrompt = Record<string, ComfyNode>;

export type ComfyWorkflow = {
    nodes: ComfyWorkflowNode[];
    links: [number, number, number, number, number, string][];
    groups: any[];
    config: any;
    version: number;
}

export type ComfyWorkflowNode = {
    id: number;
    type: string;
    title?: string;
    pos: [number, number];
    size: { "0": number, "1": number; };
    flags: Record<string, boolean>;
    order: number;
    mode: number;
    inputs: {
        name: string;
        type: string;
        link: number;
        widget?: { name: string; };
        dir?: number;
        has_old_label?: boolean;
        label?: string;
        old_label?: string;
    }[];
    outputs: {
        name: string;
        type: string;
        links: number[];
        shape?: number;
        dir?: number;
        has_old_label?: boolean;
        label?: string;
        old_label?: string;
        slot_index?: number;
    }[];
    widgets_values: (string|number|boolean)[];
    properties: Record<string, string>;
    shape: number;
}

export type ImageExtraData = {
    id: string;
    simplifiedPrompt?: string;
    comfyPositive?: string;
    comfyNegative?: string;
}

export type inputEvent = MouseEvent | KeyboardEvent | TouchEvent;
export type pcEvent = MouseEvent | KeyboardEvent;

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