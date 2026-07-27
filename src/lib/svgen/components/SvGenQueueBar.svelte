<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import Select from '$lib/items/Select.svelte';
    import type { SvgenProgress, SvgenWorkflowSummary } from '$lib/svgen/types';

    export let status: {
        available: boolean;
        publicUrl?: string;
        convert?: boolean;
        authRequired?: boolean;
        reason?: string;
    } | null;
    export let progress: SvgenProgress | null;
    export let busy = false;
    export let queueActive = 0;
    export let queueOpen = false;
    export let workflows: SvgenWorkflowSummary[] = [];
    export let currentName = '';
    export let dirty = false;

    const LOAD_LABEL = 'Load…';

    const dispatch = createEventDispatcher<{
        refresh: void;
        save: void;
        download: void;
        load: string;
        rename: string;
        toggleQueue: void;
    }>();

    let loadValue = LOAD_LABEL;

    $: loadOptions = workflows.map((wf) => ({ value: wf.id, label: wf.name }));

    $: pct = progress && progress.max > 0
        ? Math.round((progress.value / progress.max) * 100)
        : 0;

    function onLoadChange(event: CustomEvent<string>) {
        const id = event.detail;
        loadValue = LOAD_LABEL;
        if (id)
            dispatch('load', id);
    }
</script>

<div class="bar">
    <div class="row">
        <input
            class="name"
            type="text"
            value={currentName}
            placeholder="Workflow name"
            on:change={(e) => dispatch('rename', e.currentTarget.value)}
        />
        <div class="load">
            <Select
                bind:value={loadValue}
                options={loadOptions}
                disabled={!workflows.length}
                title="Load workflow"
                on:change={onLoadChange}
            />
        </div>
        <button type="button" on:click={() => dispatch('save')} title="Save">
            Save{dirty ? '*' : ''}
        </button>
        <button type="button" on:click={() => dispatch('download')} title="Download JSON">
            JSON
        </button>
        <button
            type="button"
            class="queue-btn"
            class:active={queueOpen}
            aria-label={`Show queue, ${queueActive} active`}
            on:click={() => dispatch('toggleQueue')}
        >
            <span>Queue</span>
            <span class="count">{queueActive}</span>
        </button>
        <button type="button" on:click={() => dispatch('refresh')}>Refresh</button>
        <span class="status" class:ok={status?.available} class:bad={status && !status.available}>
            {#if !status}
                …
            {:else if status.available}
                Comfy OK{status.convert ? ' · convert' : ''}
            {:else if status.authRequired}
                Auth needed
            {:else}
                Offline
            {/if}
        </span>
    </div>

    <div class="progress" class:busy>
        <div class="fill" style={`width: ${busy || progress ? pct : 0}%`} />
    </div>
</div>

<style lang="scss">
    .bar {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.55rem 0.75rem 0.35rem;
        flex-shrink: 0;
    }

    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem;
    }

    .name {
        flex: 1 1 8rem;
        min-width: 0;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--glass);
        color: inherit;
        padding: 0.35rem 0.5rem;
    }

    .load {
        max-width: 9rem;

        :global(.trigger) {
            max-width: 9rem;
            box-sizing: border-box;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--glass);
            color: inherit;
            padding: 0.3rem 0.55rem;
            font-size: 0.8rem;
            gap: 0.35rem;
        }

        :global(.trigger:focus-visible) {
            border-radius: 8px;
            background: color-mix(in srgb, var(--glass) 70%, #fff);
        }

        :global(.value) {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        :global(.chevron) {
            margin-left: 0.25em;
        }

        :global(.panel) {
            z-index: 230;
            font-size: 0.8rem;
        }
    }

    button {
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--glass);
        color: inherit;
        padding: 0.3rem 0.55rem;
        font-size: 0.8rem;
        cursor: pointer;

        &:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }
    }

    .queue-btn {
        display: inline-flex;
        align-items: baseline;
        gap: 0.3rem;

        &.active {
            border-color: color-mix(in srgb, var(--accent, #3d8bfd) 55%, var(--line));
            background: color-mix(in srgb, var(--accent, #3d8bfd) 16%, var(--glass));
        }

        .count {
            font-size: 0.72rem;
            opacity: 0.7;
            font-weight: 500;
        }
    }

    .status {
        margin-left: auto;
        font-size: 0.75rem;
        opacity: 0.75;

        &.ok {
            color: #3a9;
        }

        &.bad {
            color: #c66;
        }
    }

    .progress {
        height: 3px;
        border-radius: 2px;
        background: color-mix(in srgb, var(--line) 70%, transparent);
        overflow: hidden;
    }

    .fill {
        height: 100%;
        background: var(--accent, #3d8bfd);
        transition: width 0.15s linear;
    }
</style>
