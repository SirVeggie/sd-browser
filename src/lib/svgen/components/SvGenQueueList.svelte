<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import {
        activeQueueCount,
        formatQueueDuration,
        queueStatusLabel,
        type SvgenQueueItem,
    } from '$lib/svgen/queue';

    export let running: SvgenQueueItem[] = [];
    export let pending: SvgenQueueItem[] = [];
    export let history: SvgenQueueItem[] = [];

    const dispatch = createEventDispatcher<{
        clearPending: void;
        cancel: string;
    }>();

    $: entries = [
        ...[...running].reverse(),
        ...[...pending].reverse(),
        ...history,
    ];
    $: active = activeQueueCount(running.length, pending.length);
</script>

<div class="panel">
    <div class="header">
        <div class="title">
            <span>Queue</span>
            <span class="active">active {active}</span>
        </div>
        <button
            type="button"
            disabled={!pending.length}
            on:click={() => dispatch('clearPending')}
        >
            Cancel all queued
        </button>
    </div>

    <div class="list">
        {#if !entries.length}
            <div class="empty">Queue is empty.</div>
        {:else}
            {#each entries as entry (entry.id + entry.status + (entry.completedAt ?? ''))}
                <div class="row">
                    <div class="details">
                        <span class="status {entry.status}">{queueStatusLabel(entry.status)}</span>
                        <span class="prompt">#{entry.number} {entry.id}</span>
                        {#if formatQueueDuration(entry.durationMs)}
                            <span class="duration">{formatQueueDuration(entry.durationMs)}</span>
                        {/if}
                    </div>
                    {#if entry.status === 'pending'}
                        <button type="button" on:click={() => dispatch('cancel', entry.id)}>
                            Cancel
                        </button>
                    {/if}
                </div>
            {/each}
        {/if}
    </div>
</div>

<style lang="scss">
    .panel {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        padding: 0.55rem 0.75rem;
        background: color-mix(in srgb, var(--bg) 92%, var(--glass));
        flex-shrink: 0;
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
    }

    .title {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        font-size: 0.8rem;
        font-weight: 700;
    }

    .active {
        font-size: 0.72rem;
        font-weight: 500;
        opacity: 0.65;
    }

    .list {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        max-height: 220px;
        overflow: auto;
    }

    .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
        min-width: 0;
        padding: 0.35rem 0.45rem;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--glass);
    }

    .details {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        min-width: 0;
    }

    .status {
        flex: 0 0 auto;
        border-radius: 999px;
        padding: 0.1rem 0.4rem;
        font-size: 0.65rem;
        font-weight: 700;

        &.running {
            color: #d9ecff;
            background: color-mix(in srgb, var(--accent, #3d8bfd) 22%, transparent);
        }

        &.pending {
            opacity: 0.85;
            background: color-mix(in srgb, var(--line) 55%, transparent);
        }

        &.done {
            color: #b6f0c3;
            background: color-mix(in srgb, #3fb950 18%, transparent);
        }

        &.error {
            color: #ffc1c1;
            background: color-mix(in srgb, #f85149 18%, transparent);
        }

        &.cancelled {
            opacity: 0.7;
            background: color-mix(in srgb, var(--line) 40%, transparent);
        }
    }

    .prompt {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.72rem;
        font-variant-numeric: tabular-nums;
    }

    .duration {
        flex: 0 0 auto;
        font-size: 0.72rem;
        font-variant-numeric: tabular-nums;
        opacity: 0.65;
    }

    .empty {
        padding: 0.45rem;
        font-size: 0.75rem;
        font-style: italic;
        opacity: 0.65;
    }

    button {
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--glass);
        color: inherit;
        padding: 0.25rem 0.5rem;
        font-size: 0.72rem;
        font-weight: 600;
        cursor: pointer;

        &:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }
    }
</style>
