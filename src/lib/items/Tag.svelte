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
        style={`--tag-color: ${add ? "transparent" : color}`}
        {disabled}
        aria-label={add ? (ariaLabel ?? "Add tag") : undefined}
        on:click
    >
        {#if add}
            + add
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
        border: 1px solid color-mix(in srgb, var(--tag-color, #5b9cf5) 32%, transparent);
        background: color-mix(in srgb, var(--tag-color, #5b9cf5) 28%, #1c1814);
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
            color 200ms ease,
            filter 200ms ease,
            box-shadow 200ms ease;

        &:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        &.preview {
            cursor: default;
            user-select: none;
        }

        &.add {
            background: transparent;
            color: var(--muted);
            border: 1px dashed rgba(235, 228, 216, 0.28);
            padding: var(--tag-pad-y) var(--tag-pad-x);
            font-weight: 600;

            &:not(:disabled):hover {
                color: var(--accent);
                border-color: rgba(196, 165, 116, 0.45);
                background: var(--accent-soft);
            }
        }

        &.selected {
            box-shadow: 0 0 0 1px color-mix(in srgb, var(--tag-color, #5b9cf5) 70%, transparent);
        }

        &.highlight-on-hover:not(:disabled):hover {
            filter: brightness(1.1);
        }

        &.deletable:not(:disabled):hover {
            background: color-mix(in srgb, #c44 42%, #1c1814);
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

</style>
