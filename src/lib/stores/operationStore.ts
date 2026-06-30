import { writable } from 'svelte/store';
import type { OperationInfo } from '$lib/types/requests';

export const operationStore = writable<OperationInfo[]>([]);

export function hasRunningOperation(operations: OperationInfo[], type: OperationInfo['type']): boolean {
    return operations.some(op => op.type === type && op.status === 'running');
}
