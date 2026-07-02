<script lang="ts">
    import { DEFAULT_TAG_COLOR } from "$lib/types/tags";

    export let add = false;
    export let color: string = DEFAULT_TAG_COLOR;
    export let selected = false;
    export let deletable = false;
    export let disabled = false;
    export let highlightOnHover = false;
    export let interactive = true;
    export let ariaLabel: string | undefined = undefined;
</script>

{#if interactive}
    <button
        type="button"
        class="tag"
        class:add
        class:selected
        class:deletable
        class:highlight-on-hover={highlightOnHover}
        style={`--tag-color: ${add ? "#888" : color}`}
        {disabled}
        aria-label={add ? (ariaLabel ?? "Add tag") : undefined}
        on:click
    >
        {#if add}
            <svg class="add-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 4.5v7M4.5 8h7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
            </svg>
        {:else}
            <slot />
        {/if}
    </button>
{:else}
    <span class="tag preview" style={`--tag-color: ${color}`}>
        <slot />
    </span>
{/if}

<style lang="scss">
    .tag {
        --tag-font-size: 12px;
        --tag-pad-y: 2px;
        --tag-pad-x: 8px;
        --tag-height: 23px;

        appearance: none;
        margin: 0;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid color-mix(in srgb, var(--tag-color, #5b9cf5) 65%, #000);
        background: color-mix(in srgb, var(--tag-color, #5b9cf5) 22%, #222);
        color: #eee;
        border-radius: 999px;
        padding: var(--tag-pad-y) var(--tag-pad-x);
        font-family: var(--font-tag);
        font-size: var(--tag-font-size);
        letter-spacing: 0.2px;
        line-height: 17px;
        height: var(--tag-height);
        cursor: pointer;
        transition:
            background 200ms ease,
            border-color 200ms ease,
            color 200ms ease,
            filter 200ms ease;

        &:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        &.preview {
            cursor: default;
            user-select: none;
        }

        &.add {
            padding: var(--tag-pad-y);
            width: var(--tag-height);
        }

        &.selected {
            box-shadow: 0 0 0 1px var(--tag-color, #5b9cf5);
        }

        &.highlight-on-hover:not(:disabled):hover {
            filter: brightness(1.08);
        }

        &.deletable:not(:disabled):hover {
            background: color-mix(in srgb, #c44 42%, #222);
            border-color: color-mix(in srgb, #c44 62%, #000);
            color: transparent;

            &::after {
                content: "×";
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fdd;
                font-size: 14px;
                line-height: 1;
            }
        }

        &:not(.preview) {
            position: relative;
        }
    }

    .add-icon {
        display: block;
        width: 14px;
        height: 14px;
        flex-shrink: 0;
    }
</style>
