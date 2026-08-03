import { getOperations, watchOperation } from '$lib/requests/operationRequests';
import { operationStore } from '$lib/stores/operationStore';

const watching = new Map<string, AbortController>();

/** Keep SSE progress flowing for an operation until it finishes (layout-owned). */
export function trackOperation(operationId: string) {
    if (!operationId || watching.has(operationId))
        return;

    const controller = new AbortController();
    watching.set(operationId, controller);

    void watchOperation(
        operationId,
        operations => operationStore.set(operations),
        controller.signal,
    ).finally(() => {
        if (watching.get(operationId) === controller)
            watching.delete(operationId);
    });
}

/** Hydrate the store and attach watchers for any already-running operations. */
export async function syncRunningOperations() {
    const operations = await getOperations();
    operationStore.set(operations);
    for (const operation of operations) {
        if (operation.status === 'running')
            trackOperation(operation.id);
    }
}

export function stopAllOperationWatches() {
    for (const controller of watching.values())
        controller.abort();
    watching.clear();
}
