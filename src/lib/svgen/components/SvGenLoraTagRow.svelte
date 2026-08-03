<script lang="ts">
    import DragHandle from '$lib/components/DragHandle.svelte';
    import { numberDrag, type NumberDragParams } from '../../../actions/numberDrag';
    import type { LoraTagRow } from '$lib/svgen/loraTagText';
    import SvGenComboPicker from './SvGenComboPicker.svelte';
    import SvGenEnablePill from './SvGenEnablePill.svelte';

    export let row: LoraTagRow;
    export let editMode = false;
    export let showClip = false;
    export let options: string[] = [];
    export let fieldDomPrefix: string;
    export let strengthStep = 0.05;
    export let strengthDrag: (id: string, key: 'strength' | 'clipStrength') => NumberDragParams;
    export let startDrag: ((event: PointerEvent) => void) | undefined = undefined;
    export let onToggle: (enabled: boolean) => void;
    export let onName: (name: string) => void;
    export let onStrengthType: (raw: string, key: 'strength' | 'clipStrength') => void;
    export let onRemove: (() => void) | undefined = undefined;
</script>

<div class="row" class:disabled={!row.enabled}>
    {#if editMode && startDrag}
        <DragHandle
            label="Drag to reorder LoRA"
            on:pointerdown={startDrag}
        />
    {/if}
    <SvGenEnablePill
        compact
        checked={row.enabled}
        title={row.enabled ? 'Disable LoRA' : 'Enable LoRA'}
        on:change={(e) => onToggle(e.detail)}
    />
    <div class="lora">
        <SvGenComboPicker
            id={`${fieldDomPrefix}-lora-${row.id}`}
            value={row.name}
            {options}
            on:change={(e) => onName(e.detail)}
        />
    </div>
    <input
        class="strength"
        type="number"
        step={strengthStep}
        aria-label="LoRA strength"
        value={row.strength}
        use:numberDrag={strengthDrag(row.id, 'strength')}
        on:change={(e) => onStrengthType(e.currentTarget.value, 'strength')}
    />
    {#if showClip}
        <input
            class="strength"
            type="number"
            step={strengthStep}
            aria-label="LoRA CLIP strength"
            value={row.clipStrength}
            use:numberDrag={strengthDrag(row.id, 'clipStrength')}
            on:change={(e) => onStrengthType(e.currentTarget.value, 'clipStrength')}
        />
    {/if}
    {#if editMode && onRemove}
        <button
            type="button"
            class="remove"
            tabindex="-1"
            title="Remove LoRA"
            aria-label="Remove LoRA"
            on:click={onRemove}
        >×</button>
    {/if}
</div>

<style lang="scss">
    .row {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        min-width: 0;
        width: 100%;

        &.disabled {
            opacity: 0.55;
        }
    }

    .lora {
        flex: 1 1 auto;
        min-width: 0;
    }

    .strength {
        flex: 0 0 3.25rem;
        width: 3.25rem;
        box-sizing: border-box;
        height: 24px;
        margin: 0;
        padding: 0 0.3rem;
        border: none;
        border-radius: 7px;
        background: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        color: inherit;
        font: inherit;
        font-size: 0.72rem;
        font-variant-numeric: tabular-nums;
        text-align: center;
        outline: 0;
        cursor: ew-resize;
        touch-action: pan-y;
        overflow: hidden;
        text-overflow: ellipsis;
        user-select: none;
        appearance: textfield;
        -moz-appearance: textfield;

        &::-webkit-outer-spin-button,
        &::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }

        &:focus {
            cursor: text;
            user-select: text;
            box-shadow:
                inset 0 1px 4px rgba(0, 0, 0, 0.55),
                0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
        }

        &:global(.dragging) {
            cursor: ew-resize;
            user-select: none;
            box-shadow:
                inset 0 1px 4px rgba(0, 0, 0, 0.55),
                0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
        }
    }

    .remove {
        flex: 0 0 auto;
        appearance: none;
        border: none;
        background: transparent;
        color: var(--muted);
        font-size: 1.1rem;
        line-height: 1;
        padding: 0 0.15rem;
        cursor: pointer;

        &:hover {
            color: var(--danger, #c44);
        }
    }

    :global(.row .drag-handle) {
        width: 1em;
        height: 1.15em;
        flex-shrink: 0;
    }
</style>
