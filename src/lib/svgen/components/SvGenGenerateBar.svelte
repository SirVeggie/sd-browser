<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let disabled = false;
    /** Infinite mode is actively topping up the queue. */
    export let infiniteActive = false;
    export let queueRunning = 0;
    export let queueCount = 1;
    export let infinite = false;
    export let keepOneQueued = false;

    const dispatch = createEventDispatcher<{
        generate: void;
        stop: void;
        infiniteChange: boolean;
        keepOneChange: boolean;
    }>();

    $: generateLabel = infinite && infiniteActive ? 'Stop' : 'Generate';
</script>

<div class="bar">
    <button
        type="button"
        class="generate"
        class:active={infinite && infiniteActive}
        disabled={disabled && !(infinite && infiniteActive)}
        title="Generate (Ctrl+Enter). With Infinite on, starts or stops infinite generation."
        on:click={() => dispatch('generate')}
    >
        {generateLabel}
    </button>
    <button
        type="button"
        class="stop"
        title="Stop current generation"
        aria-label="Stop current generation"
        disabled={queueRunning <= 0}
        on:click={() => dispatch('stop')}
    >
        <span class="stop-icon" aria-hidden="true" />
    </button>
    <label class="control">
        x
        <input type="number" min="1" max="99" bind:value={queueCount} />
    </label>
    <label class="control">
        <input
            class="checkbox"
            type="checkbox"
            checked={infinite}
            on:change={(e) => dispatch('infiniteChange', e.currentTarget.checked)}
        />
        Infinite
    </label>
    <label class="control">
        <input
            class="checkbox"
            type="checkbox"
            checked={keepOneQueued}
            on:change={(e) => dispatch('keepOneChange', e.currentTarget.checked)}
        />
        Keep one queued
    </label>
</div>

<style lang="scss">
    .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        padding: 0.55rem 0.75rem;
        background: color-mix(in srgb, var(--bg) 88%, var(--glass));
        flex-shrink: 0;
    }

    .generate {
        appearance: none;
        border: 1px solid color-mix(in srgb, var(--accent, #3d8bfd) 45%, var(--line));
        border-radius: 8px;
        padding: 0.45rem 0.95rem;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
        background: color-mix(in srgb, var(--accent, #3d8bfd) 22%, var(--glass));
        color: inherit;

        &.active {
            border-color: color-mix(in srgb, var(--accent, #3d8bfd) 70%, var(--line));
            background: color-mix(in srgb, var(--accent, #3d8bfd) 35%, var(--glass));
        }

        &:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }
    }

    .stop {
        appearance: none;
        display: grid;
        place-items: center;
        width: 1.85rem;
        height: 1.85rem;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--glass);
        cursor: pointer;

        &:disabled {
            opacity: 0.4;
            filter: grayscale(1);
            cursor: not-allowed;
        }

        &:not(:disabled):hover {
            border-color: color-mix(in srgb, #e08880 45%, var(--line));
            background: color-mix(in srgb, #e08880 12%, var(--glass));
        }
    }

    .stop-icon {
        display: block;
        width: 0.72rem;
        height: 0.72rem;
        border-radius: 1px;
        background: #e08880;
    }

    .control {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--muted, inherit);
        user-select: none;
        cursor: pointer;

        input[type='number'] {
            width: 2.75rem;
            border: 1px solid var(--line);
            border-radius: 6px;
            background: var(--bg-elev, var(--glass));
            color: inherit;
            padding: 0.2rem 0.3rem;
        }
    }

    .checkbox {
        appearance: none;
        -webkit-appearance: none;
        box-sizing: border-box;
        width: 13px;
        height: 13px;
        margin: 0;
        border: none;
        border-radius: 2px;
        background: var(--bg-elev, var(--glass));
        box-shadow:
            0 1px 3px rgba(0, 0, 0, 0.35),
            inset 0 0 0 1px var(--line);
        cursor: pointer;
        position: relative;
        flex-shrink: 0;

        &::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 2px;
            background: var(--accent);
            transform: scale(0);
            transition: transform 0.12s ease;
        }

        &:checked::before {
            transform: scale(1);
        }
    }
</style>
