import { invalidAuth } from '$lib/server/auth.js';
import { subscribeImageChanges } from '$lib/server/imageChangeHub';
import { computeImageUpdate, hasUpdateChanges } from '$lib/server/imageUpdates';
import { error } from '$lib/server/responses';
import {
    createSession,
    deleteSession,
    getSession,
    patchSession,
} from '$lib/server/searchSessions';
import type { StreamInitResponse, StreamRequest, UpdateResponse } from '$lib/types/requests';
import { isStreamRequest } from '$lib/types/requests';

const encoder = new TextEncoder();
const staleCheckMs = 10_000;
const debounceMs = 100;

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

    if (query.sorting === 'random') {
        return error('Stream not supported for random sort', 400);
    }

    if (e.request.signal.aborted) {
        return error('Client disconnected', 499);
    }

    let sessionId: string | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let staleTimer: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    let closed = false;

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

            const pushIfChanged = () => {
                if (closed || e.request.signal.aborted) return;
                if (!sessionId) return;
                const session = getSession(sessionId);
                if (!session) return;

                const result = computeImageUpdate(
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

            try {
                if (e.request.signal.aborted) {
                    finish();
                    return;
                }

                const created = createSession(query);
                sessionId = created.sessionId;
                connectionTimestamp = created.timestamp;

                const init: StreamInitResponse = {
                    type: 'init',
                    sessionId: created.sessionId,
                    images: created.images,
                    amount: created.amount,
                    timestamp: created.timestamp,
                };

                if (!safeEnqueue(controller, init)) {
                    finish();
                    return;
                }

                unsubscribe = subscribeImageChanges(schedulePush);
                staleTimer = setInterval(pushIfChanged, staleCheckMs);
            } catch (err) {
                if (sessionId) deleteSession(sessionId);
                sessionId = undefined;
                if (err instanceof Error) {
                    console.log(err.message);
                } else {
                    console.error(err);
                }
                finish();
            }
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
