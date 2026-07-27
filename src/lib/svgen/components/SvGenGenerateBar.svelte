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
        background: color-mix(in srgb, var(--bg) 90%, var(--glass));
        flex-shrink: 0;
    }

    .generate {
        appearance: none;
        border: none;
        border-radius: 0.4em;
        padding: 0.45rem 0.95rem;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
        background: var(--accent-soft);
        color: var(--ink);
        transition: background-color 0.08s ease;

        &:hover:not(:disabled) {
            background: rgba(196, 165, 116, 0.24);
        }

        &.active {
            background: rgba(196, 165, 116, 0.32);
            color: var(--accent);
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
        border: none;
        border-radius: 0.4em;
        background: var(--accent-soft);
        cursor: pointer;
        transition: background-color 0.08s ease;

        &:disabled {
            opacity: 0.4;
            filter: grayscale(1);
            cursor: not-allowed;
        }

        &:not(:disabled):hover {
            background: color-mix(in srgb, var(--danger) 22%, transparent);
        }
    }

    .stop-icon {
        display: block;
        width: 0.72rem;
        height: 0.72rem;
        border-radius: 1px;
        background: var(--danger);
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
            border: none;
            border-radius: 7px;
            background: rgba(0, 0, 0, 0.22);
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
            color: inherit;
            padding: 0.2rem 0.3rem;

            &:focus {
                outline: none;
                box-shadow:
                    inset 0 1px 4px rgba(0, 0, 0, 0.55),
                    0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
            }
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
        border-radius: 3px;
        background: rgba(0, 0, 0, 0.28);
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
        cursor: pointer;
        position: relative;
        flex-shrink: 0;

        &::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 3px;
            background: var(--accent);
            transform: scale(0);
            transition: transform 0.12s ease;
        }

        &:checked::before {
            transform: scale(1);
        }
    }
</style>
