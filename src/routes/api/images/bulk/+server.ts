import { invalidAuth } from "$lib/server/auth.js";
import { runBulkAction } from "$lib/server/bulk.js";
import { error } from "$lib/server/responses.js";
import { isBulkRequest, type BulkProgressEvent } from "$lib/types/requests";

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const request = await e.request.json();
    if (!isBulkRequest(request)) {
        return error("Invalid request body", 400);
    }

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const send = (event: BulkProgressEvent) => {
                controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            };

            try {
                const refresh = await runBulkAction(request, (done, total, stats) => {
                    send({
                        done,
                        total,
                        totalTaskDurationMs: stats?.totalTaskDurationMs,
                        failures: stats?.failures,
                    });
                });
                send({
                    complete: true,
                    refresh,
                });
            } catch (cause) {
                const message = cause instanceof Error ? cause.message : "Bulk action failed";
                console.error(message);
                send({ error: message });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "application/x-ndjson",
        },
    });
}
