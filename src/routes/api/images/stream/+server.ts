import { invalidAuth } from '$lib/server/auth.js';
import { subscribeImageChanges } from '$lib/server/imageChangeHub';
import { computeImageUpdate, hasUpdateChanges } from '$lib/server/imageUpdates';
import { error } from '$lib/server/responses';
import { explorationFromRequest, SearchStreamAborted, searchImagesStreaming } from '$lib/server/searching';
import {
    appendSessionChunk,
    createSessionStub,
    deleteSession,
    finalizeSession,
    getSession,
    imageLimit,
    patchSession,
    setSessionImgSearchContext,
} from '$lib/server/searchSessions';
import { mapServerImageToClient } from '$lib/tools/misc';
import type {
    StreamChunkResponse,
    StreamInitResponse,
    StreamReadyResponse,
    StreamRequest,
    UpdateResponse,
} from '$lib/types/requests';
import { isStreamRequest } from '$lib/types/requests';
import type { ServerImage } from '$lib/types/images';

const encoder = new TextEncoder();
const staleCheckMs = 10_000;
const debounceMs = 100;
const streamYieldEvery = 50;
const streamChunkIntervalMs = 100;
const streamFirstChunkMaxImages = 200;
const streamMaxChunkImages = 500;

function formatEvent(data: unknown): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function safeEnqueue(controller: ReadableStreamDefaultController, data: unknown): boolean {
    try {
        controller.enqueue(formatEvent(data));
        return true;
    } catch {
        return false;
    }
}

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query: StreamRequest = await e.request.json();
    if (!isStreamRequest(query)) {
        return error('Invalid request body', 400);
    }

    if (e.request.signal.aborted) {
        return error('Client disconnected', 499);
    }

    let sessionId: string | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let staleTimer: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    let closed = false;

    const isAborted = () => closed || e.request.signal.aborted;

    const cleanup = () => {
        if (closed) return;
        closed = true;
        clearTimeout(debounceTimer);
        clearInterval(staleTimer);
        unsubscribe?.();
        if (sessionId) deleteSession(sessionId);
    };

    const stream = new ReadableStream({
        start(controller) {
            let connectionTimestamp = Date.now();

            const pushIfChanged = async () => {
                if (isAborted()) return;
                if (!sessionId) return;
                const session = getSession(sessionId);
                if (!session) return;

                const result = await computeImageUpdate(
                    {
                        ...query,
                        timestamp: connectionTimestamp,
                        currentIds: [...session.viewIds],
                    },
                    session,
                );

                if ('error' in result) return;
                if (!hasUpdateChanges(result, session.viewIds)) {
                    connectionTimestamp = result.timestamp;
                    return;
                }

                patchSession(
                    sessionId,
                    result.additions.map((image) => image.id),
                    result.deletions,
                );
                connectionTimestamp = result.timestamp;

                const update: UpdateResponse & { type: 'update' } = {
                    type: 'update',
                    ...result,
                };
                if (!safeEnqueue(controller, update)) cleanup();
            };

            const schedulePush = () => {
                if (closed) return;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(pushIfChanged, debounceMs);
            };

            const finish = () => {
                cleanup();
                try {
                    controller.close();
                } catch {
                    // already closed
                }
            };

            e.request.signal.addEventListener('abort', finish);

            void (async () => {
                try {
                    if (isAborted()) {
                        finish();
                        return;
                    }

                    const stub = createSessionStub(query);
                    sessionId = stub.sessionId;
                    connectionTimestamp = stub.timestamp;

                    const init: StreamInitResponse = {
                        type: 'init',
                        sessionId: stub.sessionId,
                        timestamp: stub.timestamp,
                    };

                    if (!safeEnqueue(controller, init)) {
                        finish();
                        return;
                    }

                    const exploration = explorationFromRequest(query);
                    const streamOptions = {
                        yieldEvery: streamYieldEvery,
                        chunkIntervalMs: streamChunkIntervalMs,
                        firstChunkMaxImages: streamFirstChunkMaxImages,
                        firstChunkMinMs: streamChunkIntervalMs,
                        maxChunkImages: streamMaxChunkImages,
                        isAborted,
                        signal: e.request.signal,
                    };
                    let streamedToClient = 0;

                    const onChunk = (images: ServerImage[], matched: number) => {
                        if (isAborted()) throw new SearchStreamAborted();

                        if (images.length) {
                            appendSessionChunk(
                                sessionId!,
                                images.map((image) => image.id),
                            );
                        }

                        let toSend: ServerImage[] = [];
                        if (streamedToClient < imageLimit && images.length) {
                            const take = Math.min(images.length, imageLimit - streamedToClient);
                            toSend = take === images.length ? images : images.slice(0, take);
                            streamedToClient += toSend.length;
                        }

                        const chunk: StreamChunkResponse = {
                            type: 'chunk',
                            images: toSend.length ? mapServerImageToClient(toSend) : [],
                            matched,
                        };
                        if (!safeEnqueue(controller, chunk))
                            throw new SearchStreamAborted();
                    };

                    const result = await searchImagesStreaming(
                        query.search,
                        query.matching,
                        exploration,
                        query.sorting,
                        onChunk,
                        streamOptions,
                    );

                    if (isAborted()) {
                        finish();
                        return;
                    }

                    finalizeSession(sessionId, result.orderedIds);
                    setSessionImgSearchContext(sessionId!, result.imgSearchContext);

                    const ready: StreamReadyResponse = {
                        type: 'ready',
                        amount: result.amount,
                        imgSearchError: result.imgSearchContext?.error,
                    };

                    if (!safeEnqueue(controller, ready)) {
                        finish();
                        return;
                    }

                    unsubscribe = subscribeImageChanges(schedulePush);
                    staleTimer = setInterval(pushIfChanged, staleCheckMs);
                } catch (err) {
                    if (err instanceof SearchStreamAborted || isAborted()) {
                        finish();
                        return;
                    }
                    if (sessionId) deleteSession(sessionId);
                    sessionId = undefined;
                    if (err instanceof Error) {
                        console.log(err.message);
                    } else {
                        console.error(err);
                    }
                    finish();
                }
            })();
        },
        cancel() {
            cleanup();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
