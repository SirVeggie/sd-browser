import { invalidAuth } from '$lib/server/auth.js';
import { getOperations, subscribeOperationUpdates } from '$lib/server/operations.js';
import { error } from '$lib/server/responses.js';

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

    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            let closed = false;
            let heartbeat: ReturnType<typeof setInterval> | undefined;
            let unsubscribe = () => {};

            const close = () => {
                if (closed)
                    return;
                closed = true;
                if (heartbeat)
                    clearInterval(heartbeat);
                unsubscribe();
                e.request.signal.removeEventListener('abort', close);
                controller.close();
            };

            const sendOperations = (operations: ReturnType<typeof getOperations>) => {
                if (closed)
                    return;
                controller.enqueue(encoder.encode(`event: operations\ndata: ${JSON.stringify({ operations })}\n\n`));
                if (!operationIsRunning(operations, operationId))
                    close();
            };

            unsubscribe = subscribeOperationUpdates(sendOperations);
            e.request.signal.addEventListener('abort', close);
            heartbeat = setInterval(() => {
                if (!closed)
                    controller.enqueue(encoder.encode(': heartbeat\n\n'));
            }, 15_000);

            sendOperations(getOperations());
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
