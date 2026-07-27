import { invalidAuth } from '$lib/server/auth';
import { error } from '$lib/server/responses';
import { subscribeComfyBridge } from '$lib/server/svgen/comfyEvents';
import { getComfyTokenFromRequest } from '$lib/server/svgen/token';

const encoder = new TextEncoder();
const heartbeatIntervalMs = 15_000;

function formatEvent(data: unknown): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function formatHeartbeat(): Uint8Array {
    return encoder.encode(': heartbeat\n\n');
}

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const clientId = e.url.searchParams.get('clientId')?.trim();
    if (!clientId) {
        return error('clientId query parameter is required', 400);
    }

    const token = getComfyTokenFromRequest(e);
    const signal = e.request.signal;

    let unsubscribe: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const safeEnqueue = (chunk: Uint8Array) => {
                try {
                    controller.enqueue(chunk);
                    return true;
                } catch {
                    return false;
                }
            };

            safeEnqueue(formatEvent({ type: 'svgen_bridge', data: { ok: true, clientId } }));

            unsubscribe = subscribeComfyBridge(
                clientId,
                (message) => {
                    if (!safeEnqueue(formatEvent(message)))
                        cleanup();
                },
                token,
            );

            heartbeat = setInterval(() => {
                if (!safeEnqueue(formatHeartbeat()))
                    cleanup();
            }, heartbeatIntervalMs);

            const onAbort = () => cleanup();
            signal.addEventListener('abort', onAbort);

            function cleanup() {
                signal.removeEventListener('abort', onAbort);
                if (heartbeat) {
                    clearInterval(heartbeat);
                    heartbeat = undefined;
                }
                unsubscribe?.();
                unsubscribe = undefined;
                try {
                    controller.close();
                } catch {
                    /* ignore */
                }
            }
        },
        cancel() {
            if (heartbeat)
                clearInterval(heartbeat);
            unsubscribe?.();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
}
