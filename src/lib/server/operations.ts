import { v4 as uuid } from 'uuid';

export type OperationStatus = 'running' | 'complete' | 'failed';
export type OperationType = 'extradata-recalc';

export type Operation = {
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

const PRUNE_AFTER_MS = 30_000;
const operations = new Map<string, Operation>();
const runningByType = new Map<OperationType, string>();
const listeners = new Set<(operations: Operation[]) => void>();

function pruneFinished() {
    const cutoff = Date.now() - PRUNE_AFTER_MS;
    for (const [id, op] of operations) {
        if (op.status !== 'running' && (op.finishedAt ?? 0) < cutoff)
            operations.delete(id);
    }
}

function operationSnapshot(): Operation[] {
    pruneFinished();
    return [...operations.values()].sort((a, b) => b.startedAt - a.startedAt);
}

function notifyOperationChange() {
    const snapshot = operationSnapshot();
    for (const listener of listeners)
        listener(snapshot);
}

export function startOperation(type: OperationType, label: string, total: number): Operation {
    if (runningByType.has(type))
        throw new Error(`${type} is already running`);

    pruneFinished();
    const operation: Operation = {
        id: uuid(),
        type,
        label,
        status: 'running',
        done: 0,
        total,
        startedAt: Date.now(),
    };
    operations.set(operation.id, operation);
    runningByType.set(type, operation.id);
    notifyOperationChange();
    return operation;
}

export function updateProgress(id: string, done: number, message?: string) {
    const operation = operations.get(id);
    if (!operation || operation.status !== 'running')
        return;
    operation.done = done;
    if (message !== undefined)
        operation.message = message;
    notifyOperationChange();
}

export function completeOperation(id: string) {
    const operation = operations.get(id);
    if (!operation)
        return;
    operation.status = 'complete';
    operation.done = operation.total;
    operation.finishedAt = Date.now();
    runningByType.delete(operation.type);
    notifyOperationChange();
}

export function failOperation(id: string, error: string) {
    const operation = operations.get(id);
    if (!operation)
        return;
    operation.status = 'failed';
    operation.error = error;
    operation.finishedAt = Date.now();
    runningByType.delete(operation.type);
    notifyOperationChange();
}

export function getOperations(): Operation[] {
    return operationSnapshot();
}

export function isOperationTypeRunning(type: OperationType): boolean {
    return runningByType.has(type);
}

export function getRunningOperationId(type: OperationType): string | undefined {
    return runningByType.get(type);
}

export function subscribeOperationUpdates(listener: (operations: Operation[]) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
