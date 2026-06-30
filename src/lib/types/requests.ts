import type { ClientImage } from "./images";
import {
    isSortingMethod,
    isSimilarityAlgorithm,
    type ExplorationMode,
    type SearchMode,
    type SimilarityAlgorithm,
    type SortingMethod,
    testType,
} from "./misc";

export type ActionRequest = NsfwAction | FavoriteAction | MoveAction | CopyAction | DeleteAction | OpenAction;
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

export type MoveAction = {
    type: 'move';
    folder: string;
};

export type CopyAction = {
    type: 'copy';
    folder: string;
}

export type DeleteAction = {
    type: 'delete';
};

export type OpenAction = {
    type: 'open';
};

export type ImageRequest = {
    search: string;
    filters: string[];
    latestId: string;
    oldestId: string;
    matching: SearchMode;
    sorting: SortingMethod;
    explorationMode: ExplorationMode;
    sparseFrequency: number;
    similarityAlgorithm: SimilarityAlgorithm;
    similarityThreshold: number;
    sessionId?: string;
};
export function isImageRequest(object: any): object is ImageRequest {
    return testType(object, [
        'search', 'filters', 'latestId', 'oldestId', 'sorting',
        'explorationMode', 'sparseFrequency', 'similarityAlgorithm', 'similarityThreshold',
        (o) => isSortingMethod(o.sorting),
        (o) => typeof o.explorationMode === 'string',
        (o) => typeof o.sparseFrequency === 'number',
        (o) => isSimilarityAlgorithm(o.similarityAlgorithm),
        (o) => typeof o.similarityThreshold === 'number',
        (o) => o.sessionId === undefined || typeof o.sessionId === 'string',
    ]);
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
    sorting: SortingMethod;
    explorationMode: ExplorationMode;
    sparseFrequency: number;
    similarityAlgorithm: SimilarityAlgorithm;
    similarityThreshold: number;
    timestamp: number;
    currentIds: string[];
};
export function isUpdateRequest(object: any): object is UpdateRequest {
    return testType(object, [
        'search', 'filters', 'matching', 'sorting', 'timestamp', 'currentIds',
        'explorationMode', 'sparseFrequency', 'similarityAlgorithm', 'similarityThreshold',
        (o) => isSortingMethod(o.sorting),
        (o) => Array.isArray(o.currentIds),
        (o) => typeof o.explorationMode === 'string',
        (o) => typeof o.sparseFrequency === 'number',
        (o) => isSimilarityAlgorithm(o.similarityAlgorithm),
        (o) => typeof o.similarityThreshold === 'number',
    ]);
}

export type UpdateResponse = {
    additions: Omit<ClientImage, 'url'>[];
    deletions: string[];
    timestamp: number;
};
export function isUpdateResponse(object: any): object is UpdateResponse {
    return testType(object, ['additions', 'deletions', 'timestamp']);
}

export type StreamRequest = Omit<UpdateRequest, 'timestamp' | 'currentIds'>;
export function isStreamRequest(object: any): object is StreamRequest {
    return testType(object, [
        'search', 'filters', 'matching', 'sorting',
        'explorationMode', 'sparseFrequency', 'similarityAlgorithm', 'similarityThreshold',
        (o) => isSortingMethod(o.sorting),
        (o) => typeof o.explorationMode === 'string',
        (o) => typeof o.sparseFrequency === 'number',
        (o) => isSimilarityAlgorithm(o.similarityAlgorithm),
        (o) => typeof o.similarityThreshold === 'number',
    ]);
}

export type StreamInitResponse = {
    type: 'init';
    sessionId: string;
    timestamp: number;
};

export type StreamChunkResponse = {
    type: 'chunk';
    images: Omit<ClientImage, 'url'>[];
    /** Running match count on the server when this chunk was emitted. */
    matched: number;
};

export type StreamReadyResponse = {
    type: 'ready';
    amount: number;
};

export type StreamUpdateResponse = UpdateResponse & {
    type: 'update';
};

export type StreamEvent =
    | StreamInitResponse
    | StreamChunkResponse
    | StreamReadyResponse
    | StreamUpdateResponse;

export type SettingsRequest = {
    settingsJson: string;
};
export function isSettingRequest(object: any): object is SettingsRequest {
    return testType(object, ['settingsJson']);
}

export type SettingsResponse = {
    settingsJson: string;
};
export function isSettingResponse(object: any): object is SettingsResponse {
    return testType(object, ['settingsJson']);
}

export type RecalculateSimilarCacheRequest = {
    similarityAlgorithm: SimilarityAlgorithm;
    similarityThreshold: number;
};
export function isRecalculateSimilarCacheRequest(object: any): object is RecalculateSimilarCacheRequest {
    return testType(object, [
        'similarityAlgorithm', 'similarityThreshold',
        (o) => isSimilarityAlgorithm(o.similarityAlgorithm),
        (o) => typeof o.similarityThreshold === 'number',
    ]);
}

export type RecalculateSimilarCacheResponse = {
    poolSize: number;
    imageCount: number;
};
export function isRecalculateSimilarCacheResponse(object: any): object is RecalculateSimilarCacheResponse {
    return testType(object, [
        'poolSize', 'imageCount',
        (o) => typeof o.poolSize === 'number',
        (o) => typeof o.imageCount === 'number',
    ]);
}

export type Folder = {
    name: string;
    parent: string;
    subfolders: Folder[];
};
export type FoldersResponse = {
    folders: Folder[];
};
export function isFoldersResponse(object: any): object is FoldersResponse {
    return testType(object, ['folders']);
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

export type BulkLlmConfig = {
    baseUrl: string;
    apiKey?: string;
    modelId: string;
    parallelCalls: number;
};

export type BulkAnnotateMode = 'generate' | 'clear' | 'modify';

export type BulkAnnotateOptions = {
    type: 'annotate';
    mode: BulkAnnotateMode;
    includeImage: boolean;
    includePrompt: boolean;
    systemInstruction: string;
    responsePrefix: string;
    disableThinking: boolean;
    resultRegex?: string;
    resultTemplate?: string;
    appendResult: boolean;
};

export type BulkAction = MoveAction | CopyAction | DeleteAction | BulkAnnotateOptions;

export type MatchRequest = {
    search: string;
    filters: string[];
    matching: SearchMode;
    explorationMode: ExplorationMode;
    sparseFrequency: number;
    similarityAlgorithm: SimilarityAlgorithm;
    similarityThreshold: number;
};
export function isMatchRequest(object: any): object is MatchRequest {
    return testType(object, [
        'search', 'filters', 'matching',
        'explorationMode', 'sparseFrequency', 'similarityAlgorithm', 'similarityThreshold',
        (o) => typeof o.explorationMode === 'string',
        (o) => typeof o.sparseFrequency === 'number',
        (o) => isSimilarityAlgorithm(o.similarityAlgorithm),
        (o) => typeof o.similarityThreshold === 'number',
    ]);
}

export type MatchResponse = {
    total: number;
};
export function isMatchResponse(object: any): object is MatchResponse {
    return testType(object, ['total']);
}

export type BulkRequest = {
    search: string;
    filters: string[];
    matching: SearchMode;
    explorationMode: ExplorationMode;
    sparseFrequency: number;
    similarityAlgorithm: SimilarityAlgorithm;
    similarityThreshold: number;
    action: BulkAction;
    llm?: BulkLlmConfig;
};

export function isBulkRequest(object: any): object is BulkRequest {
    return testType(object, [
        'search', 'filters', 'matching', 'action',
        'explorationMode', 'sparseFrequency', 'similarityAlgorithm', 'similarityThreshold',
        (o) => typeof o.explorationMode === 'string',
        (o) => typeof o.sparseFrequency === 'number',
        (o) => isSimilarityAlgorithm(o.similarityAlgorithm),
        (o) => typeof o.similarityThreshold === 'number',
        (o) => typeof o.action?.type === 'string',
    ]);
}

export type BulkProgressEvent = {
    done: number;
    total: number;
    totalTaskDurationMs?: number;
    failures?: number;
} | {
    complete: true;
    refresh?: boolean;
} | {
    error: string;
};