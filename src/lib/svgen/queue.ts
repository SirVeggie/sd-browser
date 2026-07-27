export type QueueItemStatus =
    | 'running'
    | 'pending'
    | 'done'
    | 'error'
    | 'cancelled';

export type SvgenQueueItem = {
    id: string;
    number: string;
    status: QueueItemStatus;
    durationMs?: number | null;
    completedAt?: number | null;
};

export type KnownQueueItem = {
    id: string;
    number: string;
    status: 'running' | 'pending';
    seenAt: number;
    startedAt: number | null;
};

export type ComfyQueueResponse = {
    queue_running?: unknown[];
    queue_pending?: unknown[];
};

const MAX_QUEUE_HISTORY = 50;

export function queueEntryPromptId(entry: unknown): string {
    if (Array.isArray(entry))
        return entry[1] == null ? '' : String(entry[1]);
    if (entry && typeof entry === 'object' && 'prompt_id' in entry) {
        const id = (entry as { prompt_id?: unknown }).prompt_id;
        return id == null ? '' : String(id);
    }
    return '';
}

export function queueEntryNumber(entry: unknown, fallback: number): string {
    if (Array.isArray(entry) && entry[0] != null)
        return String(entry[0]);
    if (entry && typeof entry === 'object' && 'number' in entry) {
        const n = (entry as { number?: unknown }).number;
        if (n != null)
            return String(n);
    }
    return String(fallback + 1);
}

export function normalizeQueueEntries(
    entries: unknown[] | undefined,
    status: 'running' | 'pending',
): SvgenQueueItem[] {
    if (!Array.isArray(entries))
        return [];
    return entries
        .map((entry, index) => ({
            id: queueEntryPromptId(entry),
            number: queueEntryNumber(entry, index),
            status,
        }))
        .filter((entry) => entry.id);
}

export function formatQueueDuration(ms: number | null | undefined): string | null {
    if (ms == null || !Number.isFinite(ms) || ms < 0)
        return null;
    const seconds = ms / 1000;
    if (seconds < 60)
        return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}

export function queueStatusLabel(status: QueueItemStatus): string {
    switch (status) {
        case 'running':
            return 'Running';
        case 'pending':
            return 'Queued';
        case 'done':
            return 'Done';
        case 'error':
            return 'Error';
        case 'cancelled':
            return 'Cancelled';
        default: {
            const _exhaustive: never = status;
            return String(_exhaustive);
        }
    }
}

export function queueHistoryStatusFromTerminal(
    terminal: string | null,
    hadStarted: boolean,
): QueueItemStatus {
    if (terminal === 'execution_error')
        return 'error';
    if (terminal === 'execution_interrupted')
        return 'cancelled';
    if (terminal === 'execution_success' || hadStarted)
        return 'done';
    return 'cancelled';
}

export function upsertQueueHistoryItem(
    items: SvgenQueueItem[],
    item: SvgenQueueItem,
): SvgenQueueItem[] {
    return [
        item,
        ...items.filter((entry) => entry.id !== item.id),
    ].slice(0, MAX_QUEUE_HISTORY);
}

export function syncKnownQueueItems(
    previous: Map<string, KnownQueueItem>,
    running: SvgenQueueItem[],
    pending: SvgenQueueItem[],
    promptStartTimes: Map<string, number>,
): {
    next: Map<string, KnownQueueItem>;
    departed: KnownQueueItem[];
} {
    const next = new Map<string, KnownQueueItem>();
    const active = [...running, ...pending];
    for (const entry of active) {
        const existing = previous.get(entry.id);
        const startedAt = entry.status === 'running'
            ? (existing?.startedAt
                ?? promptStartTimes.get(entry.id)
                ?? Date.now())
            : (existing?.startedAt ?? promptStartTimes.get(entry.id) ?? null);
        next.set(entry.id, {
            id: entry.id,
            number: entry.number,
            status: entry.status,
            seenAt: existing?.seenAt ?? Date.now(),
            startedAt,
        });
    }
    const departed: KnownQueueItem[] = [];
    for (const [id, item] of previous) {
        if (!next.has(id))
            departed.push(item);
    }
    return { next, departed };
}

export function desiredQueueTotal(keepOneQueued: boolean): number {
    return keepOneQueued ? 2 : 1;
}

export function activeQueueCount(running: number, pending: number): number {
    return running + pending;
}
