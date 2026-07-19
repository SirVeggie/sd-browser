import { get } from 'svelte/store';
import { authStore } from '$lib/stores/authStore';
import { doGet, doPost, doServerGet, doServerPost, type FetchType } from '../tools/requests';
import { page } from '$app/stores';
import type {
    ActionRequest,
    BulkEmbeddingConfig,
    ImagePageRequest,
    ImageResponse,
    MultiActionRequest,
    SessionExclusionRequest,
    StreamChunkResponse,
    StreamEvent,
    StreamInitResponse,
    StreamReadyResponse,
    StreamRequest,
    UpdateRequest,
    UpdateResponse,
} from '$lib/types/requests';
import { isImageInfo, type ImageBlobs, type ImageInfo } from '$lib/types/images';
import { testType, type GeneratedQualityMode, type QualityMode } from '$lib/types/misc';

export type StreamHandlers = {
    onInit: (init: StreamInitResponse) => void;
    onChunk: (chunk: StreamChunkResponse) => void;
    onReady: (ready: StreamReadyResponse) => void;
    onUpdate: (update: UpdateResponse) => void;
};

export type ComfyWorkflowOpenStatus = {
    available: boolean;
    url?: string;
    authRequired?: boolean;
    reason?: string;
};

export class ComfyAuthRequiredError extends Error {
    constructor(message = 'ComfyUI authentication required') {
        super(message);
        this.name = 'ComfyAuthRequiredError';
    }
}

function isComfyWorkflowOpenStatus(value: unknown): value is ComfyWorkflowOpenStatus {
    return !!value
        && typeof value === 'object'
        && 'available' in value
        && typeof value.available === 'boolean';
}

function comfyHeaders(comfyToken: string | undefined): HeadersInit {
    const headers: Record<string, string> = {
        Authorization: 'Bearer ' + get(authStore).password,
    };
    const trimmed = comfyToken?.trim();
    if (trimmed)
        headers['X-Comfy-Authorization'] = `Bearer ${trimmed}`;
    return headers;
}

function responseHasErrorCode(value: unknown, code: string): boolean {
    return !!value
        && typeof value === 'object'
        && 'code' in value
        && value.code === code;
}

export async function fetchImagePage(request: ImagePageRequest, fetch?: FetchType): Promise<ImageResponse> {
    let url = '/api/images';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, request) : doServerPost(url, request));

    if ('error' in res) {
        if (typeof res.error === 'string' && res.error.startsWith('Malformed search string')) {
            console.log(res.error);
            return {
                images: [],
                amount: -1,
                timestamp: -1,
            };
        } else {
            throw new Error(res.error);
        }
    }

    if ('message' in res) {
        throw new Error(res.message);
    }

    return res;
}

export async function updateImages(search: UpdateRequest, fetch?: FetchType): Promise<UpdateResponse> {
    let url = '/api/images/update';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, search) : doServerPost(url, search));

    if ('error' in res) {
        if (typeof res.error === 'string' && res.error.startsWith('Malformed search string')) {
            return {
                additions: [],
                deletions: [],
                timestamp: -1,
            }
        } else {
            throw new Error(res.error);
        }
    }

    if ('message' in res) {
        throw new Error(res.message);
    }

    return res;
}

export async function setSessionImageExclusion(
    request: SessionExclusionRequest,
    fetch?: FetchType,
): Promise<UpdateResponse> {
    let url = '/api/images/session';
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, request) : doServerPost(url, request));
    if ('error' in res)
        throw new Error(res.error);
    if ('message' in res)
        throw new Error(res.message);
    return res;
}

export async function subscribeImageStream(
    query: StreamRequest,
    handlers: StreamHandlers,
    signal: AbortSignal,
): Promise<void> {
    const staleCheckIntervalMs = 5_000;
    const staleTimeoutMs = 45_000;

    let url = '/api/images/stream';
    url = get(page).url.origin + url;

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + get(authStore).password,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(query),
            signal,
        });
    } catch (err) {
        if (signal.aborted || isAbortError(err)) return;
        throw err;
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Stream failed: ${response.status} ${text}`);
    }

    if (!response.body) {
        throw new Error('Stream failed: empty response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastActivityAt = Date.now();
    let stale = false;
    let staleTimer: ReturnType<typeof setInterval> | undefined;

    const touchActivity = () => {
        lastActivityAt = Date.now();
    };

    staleTimer = setInterval(() => {
        if (signal.aborted) return;
        if (Date.now() - lastActivityAt > staleTimeoutMs) {
            stale = true;
            void reader.cancel();
        }
    }, staleCheckIntervalMs);

    try {
        while (true) {
            if (signal.aborted) return;
            if (stale) throw new Error('Image stream stale');

            let readResult: ReadableStreamReadResult<Uint8Array>;
            try {
                readResult = await reader.read();
            } catch (err) {
                if (signal.aborted || isAbortError(err)) return;
                throw err;
            }

            const { done, value } = readResult;
            if (done) break;

            touchActivity();
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';

            for (const part of parts) {
                for (const line of part.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    let json: StreamEvent;
                    try {
                        json = JSON.parse(line.slice(6)) as StreamEvent;
                    } catch {
                        throw new Error('Image stream sent invalid JSON');
                    }
                    if (json.type === 'init') handlers.onInit(json);
                    else if (json.type === 'chunk') handlers.onChunk(json);
                    else if (json.type === 'ready') handlers.onReady(json);
                    else if (json.type === 'update') handlers.onUpdate(json);
                }
            }
        }
        if (!signal.aborted) {
            throw new Error('Image stream closed unexpectedly');
        }
    } finally {
        clearInterval(staleTimer);
        try {
            await reader.cancel();
        } catch {
            // ignore cancel errors during teardown
        }
    }
}

function isAbortError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    if (err.name === 'AbortError') return true;
    // Chromium reports aborted fetch streams as TypeError: Failed to fetch / network error
    if (err.name === 'TypeError' && /fetch|network|aborted/i.test(err.message)) return true;
    return false;
}

export function getQualityParam(mode: QualityMode) {
    switch (mode) {
        case 'original':
            return 'quality=original';
        case 'medium':
            return 'quality=medium';
        case 'low':
            return 'quality=low';
        case 'minimal':
            return 'quality=minimal';
        default: {
            const _exhaustive: never = mode;
            return `quality=${_exhaustive}`;
        }
    }
}

export function buildImageQueryParams(mode: QualityMode, extra?: string) {
    const parts = [getQualityParam(mode)];
    if (extra) parts.push(extra);
    return parts.join('&');
}

export function getPreviewParam(type: 'image' | 'video' | undefined, animated: boolean) {
    return `preview=${type === 'video' && !animated}`;
}

function isImageBlobs(object: unknown): object is ImageBlobs {
    return testType(object, ['id']);
}

/** Client-side metadata cache so neighbor swaps can apply info immediately. */
const imageInfoCache = new Map<string, ImageInfo>();
const imageInfoInflight = new Map<string, Promise<ImageInfo | undefined>>();

export function getCachedImageInfo(imageid: string): ImageInfo | undefined {
    return imageInfoCache.get(imageid);
}

export function rememberImageInfo(info: ImageInfo): void {
    if (!info?.id) return;
    imageInfoCache.set(info.id, info);
}

export async function getImageInfo(imageid: string, fetch?: FetchType): Promise<ImageInfo | undefined> {
    let url = `/api/images/${imageid}/metadata`;
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doGet(url, fetch) : doServerGet(url));
    if (isImageInfo(res)) {
        rememberImageInfo(res);
        return res;
    }
    return undefined;
}

export async function getImageBlobs(imageid: string, fetch?: FetchType): Promise<ImageBlobs | undefined> {
    let url = `/api/images/${imageid}/metadata?blobs=1`;
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doGet(url, fetch) : doServerGet(url));
    if (isImageBlobs(res))
        return res;
    return undefined;
}

export function mergeImageBlobs(info: ImageInfo, blobs: ImageBlobs): ImageInfo {
    return {
        ...info,
        prompt: blobs.prompt,
        workflow: blobs.workflow,
        extra: blobs.extra,
        blobsDeferred: undefined,
    };
}

/** Load metadata; if blobs were deferred, fetch and merge them. Calls `onInfo` as soon as short data is ready. */
export async function loadImageInfoProgressive(
    imageid: string,
    onInfo: (info: ImageInfo) => void,
    isStale?: () => boolean,
    fetch?: FetchType,
): Promise<ImageInfo | undefined> {
    const cached = getCachedImageInfo(imageid);
    if (cached && !isStale?.()) {
        onInfo(cached);
        // Still refresh when blobs were deferred or cache may be short-only.
        if (!cached.blobsDeferred)
            return cached;
    }

    const info = await getImageInfo(imageid, fetch);
    if (!info || isStale?.())
        return cached && !isStale?.() ? cached : undefined;
    onInfo(info);
    if (!info.blobsDeferred)
        return info;

    const blobs = await getImageBlobs(imageid, fetch);
    if (!blobs || isStale?.())
        return info;
    const merged = mergeImageBlobs(info, blobs);
    rememberImageInfo(merged);
    onInfo(merged);
    return merged;
}

/** Warm the metadata cache for a neighbor without requiring a UI binding. */
export function preloadImageInfo(imageid: string | undefined, fetch?: FetchType): void {
    if (!imageid) return;
    const cached = getCachedImageInfo(imageid);
    if (cached && !cached.blobsDeferred) return;
    if (imageInfoInflight.has(imageid)) return;

    const pending = loadImageInfoProgressive(imageid, rememberImageInfo, undefined, fetch)
        .finally(() => {
            if (imageInfoInflight.get(imageid) === pending)
                imageInfoInflight.delete(imageid);
        });
    imageInfoInflight.set(imageid, pending);
}

export async function generateCompressedImages(
    ids: string[],
    tier: GeneratedQualityMode = 'medium',
    fetch?: FetchType,
): Promise<void> {
    if (!ids || !ids.length)
        return console.log('Invalid generation request');
    let url = `/api/generate`;
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, { ids, tier }) : doServerPost(url, { ids, tier }));
    if ('error' in res)
        return console.error(res.error);
    if ('message' in res)
        return console.log(res.message);
}

export async function imageAction(ids: string | string[], action: ActionRequest, fetch?: FetchType): Promise<void> {
    if (typeof ids === 'string') ids = [ids];

    const multiaction: MultiActionRequest = {
        ids,
        ...action
    };

    let url = "/api/images/action";
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, multiaction) : doServerPost(url, multiaction));
    if ('error' in res)
        return console.error(res.error);
    if ('message' in res)
        return console.log(res.message);
}

export async function openWorkflowInComfy(imageId: string, comfyToken?: string, fetch?: FetchType): Promise<void> {
    let url = '/api/comfy/open-workflow';
    if (!fetch)
        url = get(page).url.origin + url;
    const response = await (fetch ?? window.fetch)(url, {
        method: 'POST',
        headers: {
            ...comfyHeaders(comfyToken),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageId, comfyToken }),
    });
    const res = await response.json().catch(() => ({}));
    if (response.status === 401 && responseHasErrorCode(res, 'comfy_auth_required'))
        throw new ComfyAuthRequiredError();
    if ('error' in res && typeof res.error === 'string')
        throw new Error(res.error);
    if ('message' in res)
        return;
}

export type ImageEmbedEnsureStatus = "exists" | "created" | "failed" | "skipped";

export type ImageEmbedEnsureResult = {
    id: string;
    status: ImageEmbedEnsureStatus;
    error?: string;
};

function isImageEmbedEnsureStatus(value: unknown): value is ImageEmbedEnsureStatus {
    return value === "exists" || value === "created" || value === "failed" || value === "skipped";
}

export async function ensureImageEmbedding(
    id: string,
    embedding: BulkEmbeddingConfig,
    fetch?: FetchType,
): Promise<ImageEmbedEnsureResult> {
    let url = `/api/images/${id}/embed`;
    if (!fetch) {
        url = get(page).url.origin + url;
    }

    const res = await (fetch ? doPost(url, fetch, { embedding }) : doServerPost(url, { embedding }));
    if ("error" in res && typeof res.error === "string") {
        return { id, status: "failed", error: res.error };
    }

    const status = "status" in res ? res.status : undefined;
    if (isImageEmbedEnsureStatus(status)) {
        const error = "error" in res && typeof res.error === "string" ? res.error : undefined;
        return { id, status, error };
    }

    return { id, status: "failed", error: "Unexpected embed response" };
}

export async function ensureImageEmbeddings(
    ids: string[],
    embedding: BulkEmbeddingConfig,
    fetch?: FetchType,
): Promise<ImageEmbedEnsureResult[]> {
    return Promise.all(ids.map((id) => ensureImageEmbedding(id, embedding, fetch)));
}

export async function getComfyWorkflowOpenStatus(comfyToken?: string, fetch?: FetchType): Promise<ComfyWorkflowOpenStatus> {
    let url = '/api/comfy/status';
    if (!fetch)
        url = get(page).url.origin + url;
    const response = await (fetch ?? window.fetch)(url, {
        headers: comfyHeaders(comfyToken),
    });
    const res = await response.json().catch(() => ({}));
    if (isComfyWorkflowOpenStatus(res))
        return res;
    return { available: false };
}
