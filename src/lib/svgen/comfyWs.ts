import { get } from 'svelte/store';
import { authStore } from '$lib/stores/authStore';
import { page } from '$app/stores';
import type { SvgenProgress } from './types';

export type ComfyExecutionTerminal =
    | 'execution_success'
    | 'execution_error'
    | 'execution_interrupted';

export type ComfyWsHandlers = {
    onProgress?: (progress: SvgenProgress) => void;
    onExecuting?: (node: string | null, promptId?: string | null) => void;
    onStatus?: (data: unknown) => void;
    onExecuted?: (data: unknown) => void;
    onExecutionStart?: (promptId: string | null, timestamp?: number) => void;
    onExecutionEnd?: (
        promptId: string | null,
        terminal: ComfyExecutionTerminal,
        timestamp?: number,
    ) => void;
    onError?: (error: unknown) => void;
    onClose?: () => void;
};

/**
 * Subscribe to Comfy progress via sd-browser SSE (server holds the Comfy WS).
 * Avoids Comfy's browser Origin≠Host 403 when the UI is on another port/host.
 */
export function connectComfyWs(
    _publicUrl: string | undefined,
    clientId: string,
    handlers: ComfyWsHandlers,
    token?: string,
): () => void {
    let closed = false;
    let abort: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const dispatch = (msg: { type?: string; data?: Record<string, unknown> }) => {
        const type = msg.type;
        const data = msg.data ?? {};
        if (type === 'progress') {
            handlers.onProgress?.({
                value: Number(data.value ?? 0),
                max: Number(data.max ?? 1),
                promptId: data.prompt_id != null ? String(data.prompt_id) : null,
            });
        } else if (type === 'executing') {
            const node = data.node == null ? null : String(data.node);
            handlers.onExecuting?.(
                node,
                data.prompt_id != null ? String(data.prompt_id) : null,
            );
        } else if (type === 'status') {
            handlers.onStatus?.(data);
        } else if (type === 'executed') {
            handlers.onExecuted?.(data);
        } else if (type === 'execution_start') {
            handlers.onExecutionStart?.(
                data.prompt_id != null ? String(data.prompt_id) : null,
                typeof data.timestamp === 'number' ? data.timestamp : undefined,
            );
        } else if (
            type === 'execution_success'
            || type === 'execution_error'
            || type === 'execution_interrupted'
        ) {
            const promptId = data.prompt_id != null ? String(data.prompt_id) : null;
            const timestamp = typeof data.timestamp === 'number' ? data.timestamp : undefined;
            handlers.onExecutionEnd?.(promptId, type, timestamp);
            if (type === 'execution_error')
                handlers.onError?.(data);
        }
    };

    const open = async () => {
        if (closed)
            return;
        abort = new AbortController();
        const origin = get(page).url.origin;
        const headers: Record<string, string> = {
            Authorization: 'Bearer ' + get(authStore).password,
            Accept: 'text/event-stream',
        };
        const trimmed = token?.trim();
        if (trimmed)
            headers['X-Comfy-Authorization'] = `Bearer ${trimmed}`;

        try {
            const response = await fetch(
                `${origin}/api/svgen/events?clientId=${encodeURIComponent(clientId)}`,
                { headers, signal: abort.signal },
            );
            if (!response.ok || !response.body) {
                throw new Error(`Progress bridge failed (${response.status})`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (!closed) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() ?? '';
                for (const part of parts) {
                    for (const line of part.split('\n')) {
                        if (!line.startsWith('data: '))
                            continue;
                        try {
                            dispatch(JSON.parse(line.slice(6)) as {
                                type?: string;
                                data?: Record<string, unknown>;
                            });
                        } catch {
                            /* ignore malformed */
                        }
                    }
                }
            }
        } catch (cause) {
            if (closed || (cause instanceof DOMException && cause.name === 'AbortError'))
                return;
        }

        handlers.onClose?.();
        if (!closed)
            retryTimer = setTimeout(() => void open(), 2000);
    };

    void open();

    return () => {
        closed = true;
        if (retryTimer)
            clearTimeout(retryTimer);
        abort?.abort();
        abort = null;
    };
}

export function createClientId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        return crypto.randomUUID();
    return `svgen-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
