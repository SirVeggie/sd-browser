import { invalidAuth } from '$lib/server/auth.js';
import { getOperations, subscribeOperationUpdates } from '$lib/server/operations.js';
import { error } from '$lib/server/responses.js';

const encoder = new TextEncoder();

function operationIsRunning(operations: ReturnType<typeof getOperations>, operationId: string): boolean {
    return operations.some(operation => operation.id === operationId && operation.status === 'running');
}

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const operationId = e.url.searchParams.get('operationId');
    if (!operationId)
        return error('Missing operationId', 400);

    const initialOperations = getOperations();
    if (!initialOperations.some(operation => operation.id === operationId))
        return error('Operation not found', 404);

    const signal = e.request.signal;
    let unsubscribe: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let closeController: (() => void) | undefined;

    const cleanup = () => {
        if (closed)
            return;
        closed = true;
        signal.removeEventListener('abort', cleanup);
        if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = undefined;
        }
        unsubscribe?.();
        unsubscribe = undefined;
        closeController?.();
        closeController = undefined;
    };

    const stream = new ReadableStream({
        start(controller) {
            const safeEnqueue = (chunk: Uint8Array) => {
                if (closed)
                    return false;
                try {
                    controller.enqueue(chunk);
                    return true;
                } catch {
                    return false;
                }
            };

            closeController = () => {
                try {
                    controller.close();
                } catch {
                    /* already closed by cancel/disconnect */
                }
            };

            const sendOperations = (operations: ReturnType<typeof getOperations>) => {
                if (!safeEnqueue(encoder.encode(`event: operations\ndata: ${JSON.stringify({ operations })}\n\n`))) {
                    cleanup();
                    return;
                }
                if (!operationIsRunning(operations, operationId))
                    cleanup();
            };

            unsubscribe = subscribeOperationUpdates(sendOperations);
            signal.addEventListener('abort', cleanup);

            heartbeat = setInterval(() => {
                if (!safeEnqueue(encoder.encode(': heartbeat\n\n')))
                    cleanup();
            }, 15_000);

            sendOperations(getOperations());
        },
        cancel() {
            cleanup();
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
}
