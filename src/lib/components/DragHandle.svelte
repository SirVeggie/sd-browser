<script lang="ts">
    export let label = "Drag to reorder";
    export let disabled = false;
</script>

<button
    type="button"
    class="drag-handle"
    aria-label={label}
    {disabled}
    style="touch-action: none"
    on:pointerdown
    on:click|stopPropagation|preventDefault
>
    <svg class="grip" viewBox="0 0 10 16" aria-hidden="true" focusable="false">
        <circle cx="3" cy="3" r="1.25" />
        <circle cx="7" cy="3" r="1.25" />
        <circle cx="3" cy="8" r="1.25" />
        <circle cx="7" cy="8" r="1.25" />
        <circle cx="3" cy="13" r="1.25" />
        <circle cx="7" cy="13" r="1.25" />
    </svg>
</button>

<style lang="scss">
    .drag-handle {
        appearance: none;
        margin: 0;
        padding: 0;
        border: none;
        background: transparent;
        color: #888;
        cursor: grab;
        border-radius: 4px;
        flex-shrink: 0;
        width: 1.25em;
        height: 1.5em;
        display: inline-flex;
        align-items: center;
        justify-content: center;

        &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        &:active:not(:disabled) {
            cursor: grabbing;
        }
    }

    .grip {
        display: block;
        width: 10px;
        height: 16px;
        fill: currentColor;
    }
</style>
