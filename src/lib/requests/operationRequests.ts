import { doGet, doServerGet, doServerPost, type FetchType } from '$lib/tools/requests';
import { page } from '$app/stores';
import { get } from 'svelte/store';
import { authStore } from '$lib/stores/authStore';
import { isServerError, type OperationsResponse, type StartOperationResponse } from '$lib/types/requests';

function parseOperationsEvent(block: string): OperationsResponse | undefined {
    const data = block
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice('data:'.length).trimStart())
        .join('\n');

    if (!data)
        return undefined;

    const event = JSON.parse(data) as OperationsResponse;
    if (!Array.isArray(event.operations))
        return undefined;
    return event;
}

export async function getOperations(fetch?: FetchType): Promise<OperationsResponse['operations']> {
    const response = fetch
        ? await doGet('/api/operations', fetch)
        : await doServerGet('/api/operations');

    if (isServerError(response))
        return [];

    return (response as OperationsResponse).operations ?? [];
}

export async function startExtradataRecalc(): Promise<StartOperationResponse | null> {
    const response = await doServerPost('/api/operations/extradata-recalc', {});

    if (isServerError(response))
        throw new Error(response.error);

    return response as StartOperationResponse;
}

export async function watchOperation(
    operationId: string,
    onOperations: (operations: OperationsResponse['operations']) => void,
    signal?: AbortSignal,
): Promise<void> {
    const params = new URLSearchParams({ operationId });
    const url = `${get(page).url.origin}/api/operations/events?${params.toString()}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${get(authStore).password}`,
        },
        signal,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Operation stream failed (${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader)
        throw new Error('Operation stream has no body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
            const event = parseOperationsEvent(block);
            if (event)
                onOperations(event.operations);
        }
    }

    if (buffer.trim()) {
        const event = parseOperationsEvent(buffer);
        if (event)
            onOperations(event.operations);
    }
}
