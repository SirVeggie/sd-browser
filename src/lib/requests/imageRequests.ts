import { get } from 'svelte/store';
import { authStore } from '$lib/stores/authStore';
import { doGet, doPost, doServerGet, doServerPost, type FetchType } from '../tools/requests';
import { page } from '$app/stores';
import type {
    ActionRequest,
    ImagePageRequest,
    ImageResponse,
    MultiActionRequest,
    StreamChunkResponse,
    StreamEvent,
    StreamInitResponse,
    StreamReadyResponse,
    StreamRequest,
    UpdateRequest,
    UpdateResponse,
} from '$lib/types/requests';
import { isImageInfo, type ImageInfo } from '$lib/types/images';
import type { QualityMode } from '$lib/types/misc';

export type StreamHandlers = {
    onInit: (init: StreamInitResponse) => void;
    onChunk: (chunk: StreamChunkResponse) => void;
    onReady: (ready: StreamReadyResponse) => void;
    onUpdate: (update: UpdateResponse) => void;
};

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

export async function subscribeImageStream(
    query: StreamRequest,
    handlers: StreamHandlers,
    signal: AbortSignal,
): Promise<void> {
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

    try {
        while (true) {
            if (signal.aborted) return;

            let readResult: ReadableStreamReadResult<Uint8Array>;
            try {
                readResult = await reader.read();
            } catch (err) {
                if (signal.aborted || isAbortError(err)) return;
                throw err;
            }

            const { done, value } = readResult;
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';

            for (const part of parts) {
                for (const line of part.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    const json = JSON.parse(line.slice(6)) as StreamEvent;
                    if (json.type === 'init') handlers.onInit(json);
                    else if (json.type === 'chunk') handlers.onChunk(json);
                    else if (json.type === 'ready') handlers.onReady(json);
                    else if (json.type === 'update') handlers.onUpdate(json);
                }
            }
        }
    } finally {
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
    }
}

export function getPreviewParam(type: 'image' | 'video' | undefined, animated: boolean) {
    return `preview=${type === 'video' && !animated}`;
}

export async function getImageInfo(imageid: string, fetch?: FetchType): Promise<ImageInfo | undefined> {
    let url = `/api/images/${imageid}/metadata`;
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doGet(url, fetch) : doServerGet(url));
    if (isImageInfo(res))
        return res;
    return undefined;
}

export async function generateCompressedImages(ids: string[], fetch?: FetchType): Promise<void> {
    if (!ids || !ids.length)
        return console.log('Invalid generation request');
    let url = `/api/generate`;
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doPost(url, fetch, ids) : doServerPost(url, ids));
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
