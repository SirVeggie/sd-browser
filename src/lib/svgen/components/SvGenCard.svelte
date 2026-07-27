<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import DragHandle from '$lib/components/DragHandle.svelte';
    import type { SvgenCard, SvgenField } from '$lib/svgen/types';
    import SvGenEnablePill from './SvGenEnablePill.svelte';
    import SvGenField from './SvGenField.svelte';

    export let card: SvgenCard;
    export let collapsed = false;
    export let columnIndex = 0;
    /** Pointer-down handler from column SortableList-style reorder. */
    export let startDrag: ((event: PointerEvent) => void) | undefined = undefined;

    let editMode = false;
    const dispatch = createEventDispatcher<{
        fieldChange: {
            nodeId: string;
            widgetName: string;
            value: string | number | boolean | null;
            valueIndex?: number;
            writeMode?: 'outer' | 'inner';
            innerNodeId?: string;
            outerValueIndex?: number;
        };
        toggleCollapse: string;
        fieldOrder: { nodeId: string; order: string[] };
        hideField: { nodeId: string; widgetName: string };
        persistLayout: void;
    }>();

    type FieldChangeDetail = {
        widgetName: string;
        value: string | number | boolean | null;
        valueIndex?: number;
        writeMode?: 'outer' | 'inner';
        innerNodeId?: string;
        outerValueIndex?: number;
    };

    $: enableField = card.fields.find((f) => {
        const n = f.widgetName.trim().toLowerCase();
        const l = f.label.trim().toLowerCase();
        return f.kind === 'boolean' && (n === 'enable' || n === 'enabled' || l === 'enable' || l === 'enabled');
    });
    $: bodyFields = enableField
        ? card.fields.filter((f) => f !== enableField)
        : card.fields;
    // Match original panel: output-image cards never collapse into the title row.
    $: prefersInline = bodyFields.length === 1
        && !bodyFields[0]?.tall
        && !card.imageDisplay;
    // Hide/reorder only matter when there are multiple body widgets.
    $: canEditFields = bodyFields.length > 1;
    $: if (!canEditFields)
        editMode = false;
    $: useInline = prefersInline && !collapsed && !editMode;

    function fieldKey(field: SvgenField, index: number): string {
        return [
            field.innerNodeId ?? 'outer',
            field.widgetName,
            String(field.valueIndex ?? index),
        ].join('\0');
    }

    function emitFieldChange(field: SvgenField, value: string | number | boolean | null) {
        dispatch('fieldChange', {
            nodeId: card.nodeId,
            widgetName: field.widgetName,
            value,
            valueIndex: field.valueIndex,
            writeMode: field.writeMode,
            innerNodeId: field.innerNodeId,
            outerValueIndex: field.outerValueIndex,
        });
    }

    function emitCompanion(detail: FieldChangeDetail) {
        dispatch('fieldChange', {
            nodeId: card.nodeId,
            widgetName: detail.widgetName,
            value: detail.value,
            valueIndex: detail.valueIndex,
            writeMode: detail.writeMode,
            innerNodeId: detail.innerNodeId,
            outerValueIndex: detail.outerValueIndex,
        });
    }

    function moveField(from: number, to: number) {
        if (from === to)
            return;
        const order = card.fields.map((f) => f.widgetName);
        const [item] = order.splice(from, 1);
        order.splice(to, 0, item);
        dispatch('fieldOrder', { nodeId: card.nodeId, order });
    }
</script>

<article class="card" class:collapsed class:inline={useInline} data-column={columnIndex}>
    {#if useInline}
        <div class="inline-row">
            <DragHandle
                label="Drag to reorder {card.title}"
                on:pointerdown={(e) => startDrag?.(e)}
            />
            <h3 class="title">{card.title}</h3>
            <div class="inline-field">
                <SvGenField
                    field={bodyFields[0]}
                    hideLabel
                    on:change={(e) => emitFieldChange(bodyFields[0], e.detail)}
                    on:persistLayout={() => dispatch('persistLayout')}
                />
            </div>
            {#if enableField}
                <SvGenEnablePill
                    compact
                    checked={!!enableField.value}
                    on:change={(e) => emitFieldChange(enableField, e.detail)}
                />
            {/if}
        </div>
    {:else}
        <header>
            <DragHandle
                label="Drag to reorder {card.title}"
                on:pointerdown={(e) => startDrag?.(e)}
            />
            <button
                type="button"
                class="title-btn"
                on:click={() => dispatch('toggleCollapse', card.nodeId)}
            >
                {card.title}
            </button>
            {#if enableField}
                <SvGenEnablePill
                    compact
                    checked={!!enableField.value}
                    on:change={(e) => emitFieldChange(enableField, e.detail)}
                />
            {/if}
            {#if canEditFields}
                <button
                    type="button"
                    class="edit"
                    class:active={editMode}
                    on:click={() => (editMode = !editMode)}
                    title="Edit fields"
                >Edit</button>
            {/if}
        </header>

        {#if !collapsed}
            <div class="field-grid">
                {#if card.imageDisplay}
                    <div class="field-wrap tall">
                        <div class="preview-placeholder">No preview yet</div>
                    </div>
                {/if}
                {#each bodyFields as field, index (fieldKey(field, index))}
                    <div class="field-wrap" class:tall={field.tall}>
                        {#if editMode}
                            <div class="reorder">
                                <button
                                    type="button"
                                    disabled={index === 0}
                                    on:click={() => moveField(
                                        card.fields.indexOf(field),
                                        Math.max(0, card.fields.indexOf(field) - 1),
                                    )}
                                >↑</button>
                                <button
                                    type="button"
                                    disabled={index >= bodyFields.length - 1}
                                    on:click={() => moveField(
                                        card.fields.indexOf(field),
                                        Math.min(card.fields.length - 1, card.fields.indexOf(field) + 1),
                                    )}
                                >↓</button>
                            </div>
                        {/if}
                        <SvGenField
                            {field}
                            {editMode}
                            hideLabel={bodyFields.length <= 1 && !editMode && !card.imageDisplay}
                            on:change={(e) => emitFieldChange(field, e.detail)}
                            on:companion={(e) => emitCompanion(e.detail)}
                            on:persistLayout={() => dispatch('persistLayout')}
                            on:hide={() =>
                                dispatch('hideField', {
                                    nodeId: card.nodeId,
                                    widgetName: field.widgetName,
                                })}
                        />
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</article>

<style lang="scss">
    .card {
        border: 1px solid color-mix(in srgb, var(--line) 35%, transparent);
        border-radius: 10px;
        background: color-mix(in srgb, var(--glass) 80%, var(--bg));
        overflow: visible;
        padding: 6px 8px;
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .inline-row {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        min-width: 0;
        min-height: 22px;
    }

    .inline-field {
        flex: 1;
        min-width: 0;
    }

    header {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        min-width: 0;
        min-height: 22px;
        margin: -1px 0;
    }

    .title {
        margin: 0;
        font-size: 0.78rem;
        font-weight: 600;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 40%;
    }

    .title-btn {
        flex: 1;
        text-align: left;
        appearance: none;
        border: none;
        background: transparent;
        color: inherit;
        font-weight: 600;
        font-size: 0.78rem;
        line-height: 1.2;
        cursor: pointer;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 0;
    }

    .edit {
        appearance: none;
        border: none;
        border-radius: 0.4em;
        background: transparent;
        color: var(--muted);
        font-size: 0.65rem;
        line-height: 1;
        padding: 0.2rem 0.35rem;
        cursor: pointer;
        flex-shrink: 0;

        &:hover {
            color: var(--ink);
            background: var(--accent-soft);
        }

        &.active {
            color: var(--accent);
            background: var(--accent-soft);
        }
    }

    :global(.drag-handle) {
        width: 1em;
        height: 1.15em;
    }

    :global(.drag-handle .grip) {
        width: 8px;
        height: 13px;
    }

    .preview-placeholder {
        display: grid;
        place-items: center;
        box-sizing: border-box;
        width: 100%;
        min-height: 120px;
        max-height: 220px;
        border-radius: 7px;
        border: none;
        font-size: 0.68rem;
        opacity: 0.5;
        background: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
    }

    .field-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
        gap: 5px;
    }

    .field-wrap {
        display: flex;
        gap: 0.25rem;
        align-items: flex-start;
        min-width: 0;

        &.tall {
            grid-column: 1 / -1;
        }

        :global(.field) {
            flex: 1;
            min-width: 0;
        }
    }

    .reorder {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding-top: 0.95rem;

        button {
            appearance: none;
            border: none;
            border-radius: 0.35em;
            background: var(--accent-soft);
            color: inherit;
            font-size: 0.6rem;
            line-height: 1;
            padding: 0.08rem 0.2rem;
            cursor: pointer;

            &:disabled {
                opacity: 0.3;
            }
        }
    }

    @media (max-width: 420px) {
        .field-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .field-grid > .field-wrap:last-child:nth-child(odd):not(.tall) {
            grid-column: 1 / -1;
        }
    }
</style>
