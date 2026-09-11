<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import DragHandle from '$lib/components/DragHandle.svelte';
    import SortableList from '$lib/components/SortableList.svelte';
    import type { SvgenCard, SvgenField } from '$lib/svgen/types';
    import {
        nodePreviewStoreKey,
        svgenAutocompleteSourcesStore,
        svgenLayoutStore,
        svgenNodePreviewsStore,
        svgenNodeTextPreviewsStore,
        svgenOpenSessionsStore,
    } from '$lib/svgen/stores';
    import type { NodePreviewEntry } from '$lib/svgen/nodePreviews';
    import SvGenAuthImg from './SvGenAuthImg.svelte';
    import SvGenEnablePill from './SvGenEnablePill.svelte';
    import SvGenField from './SvGenField.svelte';
    import SvGenLoraTagLoader from './SvGenLoraTagLoader.svelte';
    import {
        openContextMenu,
        refreshContextMenus,
        type ContextMenuOption,
    } from '$lib/items/ContextMenuManager.svelte';

    export let card: SvgenCard;
    export let collapsed = false;
    export let columnIndex = 0;
    /** Widget names hidden from the normal view; still listed (dimmed) while editing. */
    export let hiddenWidgetNames: string[] = [];
    /** Pointer-down handler from column SortableList-style reorder. */
    export let startDrag: ((event: PointerEvent) => void) | undefined = undefined;

    let editMode = false;
    let titleHoldTimer: ReturnType<typeof setTimeout> | undefined;
    let titleHoldStart: { x: number; y: number } | undefined;
    let suppressTitleClick = false;
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

    /**
     * Prefer exact node id, then any converter-expanded `outerId:innerId` key
     * (subgraph shells that promote $$canvas-image-preview).
     */
    function lookupNodePreview(
        store: Map<string, NodePreviewEntry>,
        sessionId: string,
        nodeId: string,
    ): NodePreviewEntry | undefined {
        const exact = store.get(nodePreviewStoreKey(sessionId, nodeId));
        if (exact)
            return exact;
        const prefix = `${nodePreviewStoreKey(sessionId, nodeId)}:`;
        for (const [key, entry] of store) {
            if (key.startsWith(prefix))
                return entry;
        }
        return undefined;
    }

    $: isLoraTagLoader = !!card.loraTagLoader;
    $: enableField = isLoraTagLoader
        ? undefined
        : card.fields.find((f) => {
            const n = f.widgetName.trim().toLowerCase();
            const l = f.label.trim().toLowerCase();
            return f.kind === 'boolean' && (n === 'enable' || n === 'enabled' || l === 'enable' || l === 'enabled');
        });
    $: loraField = card.fields.find((f) => f.kind === 'lora_tags');
    $: bodyFields = enableField
        ? card.fields.filter((f) => f !== enableField)
        : card.fields;
    /** Non–LoRA-tag fields (compact); the lora_tags field is rendered specially. */
    $: otherBodyFields = bodyFields.filter((f) => f.kind !== 'lora_tags');
    $: hiddenSet = new Set(hiddenWidgetNames);
    // Edit lists every body widget (including hidden) so Show stays reachable.
    // Lora Tag Loader uses its own edit chrome — other fields stay visible but not hide/reorder.
    $: visibleOtherFields = isLoraTagLoader
        ? otherBodyFields.filter((f) => editMode || !hiddenSet.has(f.widgetName))
        : (editMode
            ? otherBodyFields
            : otherBodyFields.filter((f) => !hiddenSet.has(f.widgetName)));
    $: visibleBodyFields = editMode
        ? bodyFields
        : bodyFields.filter((f) => !hiddenSet.has(f.widgetName));
    $: bodyFieldIds = visibleBodyFields.map((f) => fieldId(f));
    $: bodyFieldById = new Map(visibleBodyFields.map((f) => [fieldId(f), f]));
    // Match original panel: output-image cards never collapse into the title row.
    // Inline only when there is a single body widget total (hidden ones still count —
    // otherwise Edit disappears and hidden fields cannot be restored).
    $: prefersInline = !isLoraTagLoader
        && bodyFields.length === 1
        && !bodyFields[0]?.tall
        && !card.imageDisplay
        && !card.textDisplay;
    // Hide/reorder only matter when there are multiple body widgets.
    // Lora Tag Loader always has Edit (add/remove/reorder rows + clip toggle).
    $: canEditFields = isLoraTagLoader || bodyFields.length > 1;
    $: if (!canEditFields)
        editMode = false;
    $: useInline = prefersInline && !collapsed && !editMode;
    /** Separate from per-row enables — layout override (missing → on). */
    $: loraMasterEnabled =
        ($svgenLayoutStore.loraTagMasterEnabled ?? {})[card.nodeId] !== false;

    $: activeSessionId = $svgenOpenSessionsStore.activeId;
    $: autocompleteSources = $svgenLayoutStore.autocompleteSources ?? {};
    $: hasExplicitAutocompleteSources = Object.prototype.hasOwnProperty.call(
        autocompleteSources,
        card.nodeId,
    );
    $: autocompleteSourceIds = hasExplicitAutocompleteSources
        ? (autocompleteSources[card.nodeId] ?? [])
        : $svgenAutocompleteSourcesStore
            .filter((source) => source.enabledByDefault)
            .map((source) => source.id);
    $: outputPreview = card.imageDisplay && activeSessionId
        ? (lookupNodePreview($svgenNodePreviewsStore, activeSessionId, card.nodeId) ?? null)
        : null;
    $: outputPreviewPath = outputPreview?.path ?? '';
    $: outputPreviewCaption = outputPreview && outputPreview.images.length > 1
        ? `1 / ${outputPreview.images.length}`
        : '';
    $: textPreview = card.textDisplay && activeSessionId
        ? ($svgenNodeTextPreviewsStore.get(nodePreviewStoreKey(activeSessionId, card.nodeId)) ?? null)
        : null;

    /** Stable across reorder — never key SortableList by widgetName alone (proxies collide). */
    function fieldId(field: SvgenField): string {
        return [
            field.innerNodeId ?? 'outer',
            field.widgetName,
            String(field.valueIndex),
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

    function setLoraMasterEnabled(enabled: boolean) {
        const wasOn = ($svgenLayoutStore.loraTagMasterEnabled ?? {})[card.nodeId] !== false;
        if (wasOn === enabled)
            return;
        svgenLayoutStore.update((prev) => {
            const loraTagMasterEnabled = { ...(prev.loraTagMasterEnabled ?? {}) };
            if (enabled)
                delete loraTagMasterEnabled[card.nodeId];
            else
                loraTagMasterEnabled[card.nodeId] = false;
            return { ...prev, loraTagMasterEnabled };
        });
        dispatch('persistLayout');
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

    /** Apply body-widget drag order while keeping the enable pill's slot in `card.fields`. */
    function onBodyReorder(ids: string[]) {
        const bodyQueue = ids.map((id) => bodyFieldById.get(id)?.widgetName)
            .filter((name): name is string => !!name);
        let i = 0;
        const order = card.fields.map((f) => {
            if (enableField && f === enableField)
                return f.widgetName;
            return bodyQueue[i++] ?? f.widgetName;
        });
        dispatch('fieldOrder', { nodeId: card.nodeId, order });
    }

    function sourceEnabled(sourceId: string): boolean {
        if (Object.prototype.hasOwnProperty.call(
            autocompleteSources,
            card.nodeId,
        )) {
            return (autocompleteSources[card.nodeId] ?? []).includes(sourceId);
        }
        return $svgenAutocompleteSourcesStore.some(
            (source) => source.id === sourceId && source.enabledByDefault,
        );
    }

    function setSourceEnabled(sourceId: string, enabled: boolean) {
        const current = autocompleteSourceIds;
        const next = enabled
            ? [...new Set([...current, sourceId])]
            : current.filter((id) => id !== sourceId);
        svgenLayoutStore.update((layout) => ({
            ...layout,
            autocompleteSources: {
                ...(layout.autocompleteSources ?? {}),
                [card.nodeId]: next,
            },
        }));
        dispatch('persistLayout');
    }

    function sourceMenuOption(sourceId: string, name: string): ContextMenuOption {
        const option: ContextMenuOption = {
            name,
            checked: sourceEnabled(sourceId),
            handler() {
                const enabled = !sourceEnabled(sourceId);
                setSourceEnabled(sourceId, enabled);
                option.checked = enabled;
                refreshContextMenus();
                return 'keep';
            },
        };
        return option;
    }

    function openTitleMenu(x: number, y: number) {
        if (!$svgenAutocompleteSourcesStore.length)
            return;
        openContextMenu(
            { x, y },
            [{
                name: 'Autocomplete',
                submenu: true,
                handler: () => $svgenAutocompleteSourcesStore.map((source) =>
                    sourceMenuOption(source.id, source.name),
                ),
            }],
        );
    }

    function onTitleContextMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        openTitleMenu(event.clientX, event.clientY);
    }

    function clearTitleHold() {
        if (titleHoldTimer)
            clearTimeout(titleHoldTimer);
        titleHoldTimer = undefined;
        titleHoldStart = undefined;
    }

    function onTitlePointerDown(event: PointerEvent) {
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen')
            return;
        titleHoldStart = { x: event.clientX, y: event.clientY };
        titleHoldTimer = setTimeout(() => {
            suppressTitleClick = true;
            openTitleMenu(event.clientX, event.clientY);
            navigator.vibrate?.(20);
        }, 600);
    }

    function onTitlePointerMove(event: PointerEvent) {
        if (
            titleHoldStart
            && Math.hypot(
                event.clientX - titleHoldStart.x,
                event.clientY - titleHoldStart.y,
            ) > 8
        ) {
            clearTitleHold();
        }
    }

    function onTitleClick() {
        clearTitleHold();
        if (suppressTitleClick) {
            suppressTitleClick = false;
            return;
        }
        dispatch('toggleCollapse', card.nodeId);
    }
</script>

<article class="card" class:collapsed class:inline={useInline} data-column={columnIndex}>
    {#if useInline}
        <div class="inline-row">
            <DragHandle
                label="Drag to reorder {card.title}"
                on:pointerdown={(e) => startDrag?.(e)}
            />
            <h3
                class="title"
                on:contextmenu={onTitleContextMenu}
                on:pointerdown={onTitlePointerDown}
                on:pointermove={onTitlePointerMove}
                on:pointerup={clearTitleHold}
                on:pointercancel={clearTitleHold}
            >{card.title}</h3>
            <div class="inline-field">
                <SvGenField
                    field={bodyFields[0]}
                    sourceIds={autocompleteSourceIds}
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
                tabindex="-1"
                on:click={onTitleClick}
                on:contextmenu={onTitleContextMenu}
                on:pointerdown={onTitlePointerDown}
                on:pointermove={onTitlePointerMove}
                on:pointerup={clearTitleHold}
                on:pointercancel={clearTitleHold}
            >
                {card.title}
            </button>
            {#if isLoraTagLoader && loraField}
                <SvGenEnablePill
                    compact
                    checked={loraMasterEnabled}
                    title={loraMasterEnabled
                        ? 'Disable all LoRAs (override)'
                        : 'Enable LoRAs (restore per-LoRA toggles)'}
                    on:change={(e) => setLoraMasterEnabled(e.detail)}
                />
            {:else if enableField}
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
                    tabindex="-1"
                    on:click={() => (editMode = !editMode)}
                    title={isLoraTagLoader ? 'Edit LoRAs' : 'Edit fields'}
                >Edit</button>
            {/if}
        </header>

        {#if !collapsed}
            <div class="fields" class:lora-card={isLoraTagLoader}>
                {#if card.imageDisplay}
                    <div class="field-wrap tall">
                        <div class="output-preview">
                            {#if outputPreviewPath}
                                <SvGenAuthImg path={outputPreviewPath} loading="eager">
                                    <svelte:fragment slot="fallback">
                                        <span class="empty">Preview unavailable</span>
                                    </svelte:fragment>
                                </SvGenAuthImg>
                            {:else}
                                <span class="empty">No preview yet</span>
                            {/if}
                            {#if outputPreviewCaption}
                                <div class="caption" title={outputPreviewCaption}>
                                    {outputPreviewCaption}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
                {#if card.textDisplay}
                    <div class="field-wrap tall">
                        <div class="output-text" class:empty={!textPreview}>
                            {#if textPreview}
                                {textPreview}
                            {:else}
                                No preview yet
                            {/if}
                        </div>
                    </div>
                {/if}
                {#if isLoraTagLoader}
                    {#if visibleOtherFields.length}
                        <div class="field-grid compact-others">
                            {#each visibleOtherFields as field (fieldId(field))}
                                <div class="field-wrap" class:tall={field.tall}>
                                    <SvGenField
                                        {field}
                                        sourceIds={autocompleteSourceIds}
                                        editMode={false}
                                        hideLabel={visibleOtherFields.length <= 1}
                                        on:change={(e) => emitFieldChange(field, e.detail)}
                                        on:companion={(e) => emitCompanion(e.detail)}
                                        on:persistLayout={() => dispatch('persistLayout')}
                                    />
                                </div>
                            {/each}
                        </div>
                    {/if}
                    {#if loraField}
                        <div class="lora-wrap" class:master-off={!loraMasterEnabled}>
                            <SvGenLoraTagLoader
                                field={loraField}
                                {editMode}
                                clipInputWired={!!card.clipInputWired}
                                nodeId={card.nodeId}
                                on:change={(e) => emitFieldChange(loraField, e.detail)}
                                on:persistLayout={() => dispatch('persistLayout')}
                            />
                        </div>
                    {/if}
                {:else if canEditFields}
                    <div class="fields-sortable">
                        <SortableList
                            ids={bodyFieldIds}
                            axis="xy"
                            asGrid
                            disabled={!editMode}
                            on:reorder={(e) => onBodyReorder(e.detail.ids)}
                            let:id
                            let:startDrag
                        >
                            {@const field = bodyFieldById.get(id)}
                            {#if field}
                                <div class="field-wrap" class:tall={field.tall} class:editing={editMode}>
                                    {#if editMode}
                                        <DragHandle
                                            label="Drag to reorder {field.label}"
                                            on:pointerdown={startDrag}
                                        />
                                    {/if}
                                    <SvGenField
                                        {field}
                                        sourceIds={autocompleteSourceIds}
                                        {editMode}
                                        hidden={hiddenSet.has(field.widgetName)}
                                        hideLabel={false}
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
                            {/if}
                        </SortableList>
                    </div>
                {:else}
                    <div class="field-grid">
                        {#each visibleBodyFields as field (fieldId(field))}
                            <div class="field-wrap" class:tall={field.tall}>
                                <SvGenField
                                    {field}
                                    sourceIds={autocompleteSourceIds}
                                    {editMode}
                                    hideLabel={bodyFields.length <= 1 && !editMode && !card.imageDisplay && !card.textDisplay}
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
        gap: 0.5rem;
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
        user-select: none;
        -webkit-touch-callout: none;
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
        user-select: none;
        -webkit-touch-callout: none;
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
            color: color-mix(in srgb, var(--ink) 92%, white);
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

    .output-preview {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        width: 100%;
        min-height: 120px;
        max-height: 220px;
        overflow: hidden;
        border-radius: 7px;
        border: none;
        background-color: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        background-image:
            linear-gradient(45deg, color-mix(in srgb, var(--ink) 4%, transparent) 25%, transparent 25%),
            linear-gradient(-45deg, color-mix(in srgb, var(--ink) 4%, transparent) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--ink) 4%, transparent) 75%),
            linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--ink) 4%, transparent) 75%);
        background-size: 16px 16px;
        background-position: 0 0, 0 8px, 8px -8px, -8px 0;

        :global(img) {
            display: block;
            max-width: 100%;
            max-height: 220px;
            width: auto;
            height: auto;
            object-fit: contain;
        }

        .empty {
            padding: 1rem 1rem 2rem;
            font-size: 0.68rem;
            opacity: 0.5;
            text-align: center;
            font-style: italic;
        }

        .caption {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 1;
            box-sizing: border-box;
            padding: 0.35rem 0.5rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 0.65rem;
            line-height: 1.2;
            color: color-mix(in srgb, var(--ink) 92%, transparent);
            background: linear-gradient(
                to top,
                rgba(0, 0, 0, 0.72) 0%,
                rgba(0, 0, 0, 0.35) 70%,
                transparent 100%
            );
            pointer-events: none;
        }
    }

    .output-text {
        box-sizing: border-box;
        width: 100%;
        min-height: 120px;
        max-height: 280px;
        overflow: auto;
        padding: 0.45rem 0.55rem;
        border-radius: 7px;
        border: none;
        background-color: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        color: inherit;
        font-size: 0.72rem;
        line-height: 1.35;
        white-space: pre-wrap;
        word-break: break-word;

        &.empty {
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.5;
            font-style: italic;
            text-align: center;
        }
    }

    .fields {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;

        &.lora-card {
            flex: 1;
        }
    }

    .field-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
        gap: 5px;
        min-width: 0;

        &.compact-others {
            grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
        }
    }

    .lora-wrap {
        flex: 1 1 auto;
        min-width: 0;
        width: 100%;

        /* Same as per-row disabled: don't opacity the wrap (fades fixed menus). */
        &.master-off :global(.row > :not(.lora)) {
            opacity: 0.55;
        }

        &.master-off :global(.row .lora .trigger) {
            opacity: 0.55;
        }
    }

    .fields-sortable {
        min-width: 0;

        :global(.sortable-list.as-grid) {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
            gap: 5px;
            align-items: start;
        }

        :global(.sortable-item),
        :global(.sortable-item-body) {
            min-width: 0;
            width: 100%;
        }

        :global(.sortable-item:has(.tall)) {
            grid-column: 1 / -1;
        }
    }

    .field-wrap {
        display: flex;
        gap: 0.25rem;
        align-items: flex-start;
        min-width: 0;
        width: 100%;

        &.tall {
            grid-column: 1 / -1;
        }

        &.editing :global(.drag-handle) {
            margin-top: 0.95rem;
        }

        :global(.field) {
            flex: 1;
            min-width: 0;
        }
    }

    @media (max-width: 420px) {
        .field-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .fields-sortable :global(.sortable-list.as-grid) {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .field-grid > .field-wrap:last-child:nth-child(odd):not(.tall) {
            grid-column: 1 / -1;
        }

        .fields-sortable :global(.sortable-item:last-child:nth-child(odd):not(:has(.tall))) {
            grid-column: 1 / -1;
        }
    }
</style>
