import type { ClientImage } from "./images";
import type { EmbeddingSettings } from "./embeddings";
import {
    isSortingMethod,
    isSimilarityAlgorithm,
    type ExplorationMode,
    type SearchMode,
    type SimilarityAlgorithm,
    type SortingMethod,
    testType,
} from "./misc";

export type ActionRequest = MoveAction | CopyAction | DeleteAction | OpenAction;
export function isActionRequest(object: any): object is ActionRequest {
    return testType(object, ['type']);
}

export type MultiActionRequest = {
    ids: string[];
} & ActionRequest;
export function isMultiActionRequest(object: any): object is MultiActionRequest {
    return testType(object, ['ids', 'type']);
}

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

export type ImagePageRequest = {
    sessionId: string;
    latestId: string;
    oldestId: string;
};
export function isImagePageRequest(object: any): object is ImagePageRequest {
    return testType(object, [
        'sessionId', 'latestId', 'oldestId',
        (o) => typeof o.sessionId === 'string',
        (o) => typeof o.latestId === 'string',
        (o) => typeof o.oldestId === 'string',
    ]);
}

export type ImageResponse = {
    images: Omit<ClientImage, 'url'>[];
    amount: number;
    timestamp: number;
    imgSearchError?: string;
    pruneSearchError?: string;
    mmrSearchError?: string;
};
export function isImageResponse(object: any): object is ImageResponse {
    return testType(object, ['imageIds', 'amount']);
}

export type UpdateRequest = {
    search: string;
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
        'search', 'matching', 'sorting', 'timestamp', 'currentIds',
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
    /** Canonical session order after an update, when the update came from a session. */
    orderedIds?: string[];
    timestamp: number;
};
export function isUpdateResponse(object: any): object is UpdateResponse {
    return testType(object, ['additions', 'deletions', 'timestamp']);
}

export type StreamRequest = Omit<UpdateRequest, 'timestamp' | 'currentIds'> & {
    /** Completed server session to reattach after a transient stream disconnect. */
    sessionId?: string;
};
export function isStreamRequest(object: any): object is StreamRequest {
    return testType(object, [
        'search', 'matching', 'sorting',
        'explorationMode', 'sparseFrequency', 'similarityAlgorithm', 'similarityThreshold',
        (o) => isSortingMethod(o.sorting),
        (o) => typeof o.explorationMode === 'string',
        (o) => typeof o.sparseFrequency === 'number',
        (o) => isSimilarityAlgorithm(o.similarityAlgorithm),
        (o) => typeof o.similarityThreshold === 'number',
        (o) => o.sessionId === undefined || typeof o.sessionId === 'string',
    ]);
}

export type SessionExclusionRequest = {
    sessionId: string;
    ids: string[];
    excluded: boolean;
};
export function isSessionExclusionRequest(object: unknown): object is SessionExclusionRequest {
    return testType(object, [
        'sessionId', 'ids', 'excluded',
        (o) => typeof o.sessionId === 'string',
        (o) => Array.isArray(o.ids) && o.ids.every((id: unknown) => typeof id === 'string'),
        (o) => typeof o.excluded === 'boolean',
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
    imgSearchError?: string;
    pruneSearchError?: string;
    mmrSearchError?: string;
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

export type BuildUniquenessIndexResponse = {
    indexed: number;
};
export function isBuildUniquenessIndexResponse(object: any): object is BuildUniquenessIndexResponse {
    return testType(object, [
        'indexed',
        (o) => typeof o.indexed === 'number',
    ]);
}
export function isRecalculateSimilarCacheResponse(object: any): object is RecalculateSimilarCacheResponse {
    return testType(object, [
        'poolSize', 'imageCount',
        (o) => typeof o.poolSize === 'number',
        (o) => typeof o.imageCount === 'number',
    ]);
}

export type ClearCompressedImagesResponse = {
    deleted: number;
};
export function isClearCompressedImagesResponse(object: any): object is ClearCompressedImagesResponse {
    return testType(object, [
        'deleted',
        (o) => typeof o.deleted === 'number',
    ]);
}

export type FoldersResponse = {
    paths: string[];
};
export function isFoldersResponse(object: any): object is FoldersResponse {
    return testType(object, ['paths']);
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

export type BulkTagMode = 'add' | 'remove' | 'replace';

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

export type BulkTagOptions = {
    type: 'tag';
    mode: BulkTagMode;
    tags: string[];
};

export type BulkEmbeddingConfig = Omit<EmbeddingSettings, 'apiKey' | 'imageSimilarityThreshold'> & {
    apiKey?: string;
};

export type BulkVectorizeMode = 'embed' | 'clear';

export type BulkVectorizeOptions = {
    type: 'vectorize';
    mode: BulkVectorizeMode;
    force: boolean;
};

export type BulkAction = MoveAction | CopyAction | DeleteAction | BulkAnnotateOptions | BulkTagOptions | BulkVectorizeOptions;

export type MatchRequest = {
    search: string;
    matching: SearchMode;
    explorationMode: ExplorationMode;
    sparseFrequency: number;
    similarityAlgorithm: SimilarityAlgorithm;
    similarityThreshold: number;
};
export function isMatchRequest(object: any): object is MatchRequest {
    return testType(object, [
        'search', 'matching',
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
    matching: SearchMode;
    sorting: SortingMethod;
    explorationMode: ExplorationMode;
    sparseFrequency: number;
    similarityAlgorithm: SimilarityAlgorithm;
    similarityThreshold: number;
    sessionId?: string;
    action: BulkAction;
    llm?: BulkLlmConfig;
    embedding?: BulkEmbeddingConfig;
};

export function isBulkRequest(object: any): object is BulkRequest {
    return testType(object, [
        'search', 'matching', 'sorting', 'action',
        'explorationMode', 'sparseFrequency', 'similarityAlgorithm', 'similarityThreshold',
        (o) => isSortingMethod(o.sorting),
        (o) => typeof o.explorationMode === 'string',
        (o) => typeof o.sparseFrequency === 'number',
        (o) => isSimilarityAlgorithm(o.similarityAlgorithm),
        (o) => typeof o.similarityThreshold === 'number',
        (o) => o.sessionId === undefined || typeof o.sessionId === 'string',
        (o) => typeof o.action?.type === 'string',
    ]);
}

export type BulkProgressEvent = {
    done: number;
    total: number;
    totalTaskDurationMs?: number;
    failures?: number;
    lastError?: string;
} | {
    complete: true;
    refresh?: boolean;
} | {
    error: string;
};

export type OperationStatus = 'running' | 'complete' | 'failed';
export type OperationType = 'extradata-recalc';

export type OperationInfo = {
    id: string;
    type: OperationType;
    label: string;
    status: OperationStatus;
    done: number;
    total: number;
    message?: string;
    error?: string;
    startedAt: number;
    finishedAt?: number;
};

export type OperationsResponse = {
    operations: OperationInfo[];
};

export type StartOperationResponse = {
    operationId: string;
};