<script lang="ts">
    import { createEventDispatcher, onDestroy } from 'svelte';
    import SortableList from '$lib/components/SortableList.svelte';
    import { type NumberDragParams } from '../../../actions/numberDrag';
    import {
        createEmptyLoraRow,
        overlayLoraRowStrengths,
        parseLoraTagText,
        serializeLoraTagText,
        type LoraStrengthOverlay,
        type LoraTagRow,
    } from '$lib/svgen/loraTagText';
    import { uniqueLoraNames } from '$lib/svgen/loraTriggers';
    import { registerPendingFieldPeek } from '$lib/svgen/pendingFieldFlush';
    import { svgenLayoutStore } from '$lib/svgen/stores';
    import type { SvgenField } from '$lib/svgen/types';
    import SvGenEnablePill from './SvGenEnablePill.svelte';
    import SvGenLoraTagRow from './SvGenLoraTagRow.svelte';
    import SvGenLoraTriggersModal from './SvGenLoraTriggersModal.svelte';

    export let field: SvgenField;
    export let editMode = false;
    /** CLIP socket linked — show clip strength column / edit toggle. */
    export let clipInputWired = false;
    export let nodeId: string;

    const dispatch = createEventDispatcher<{
        change: string;
        persistLayout: void;
    }>();

    const STRENGTH_STEP = 0.05;

    let rows: LoraTagRow[] = [];
    let rest = '';
    let lastText: string | undefined;
    /** Scrub changed a strength; flush widget text on pointerup (not each step). */
    let strengthScrubDirty = false;
    let strengthFlushArmed = false;
    let triggersOpen = false;
    let rootEl: HTMLDivElement;

    $: text = String(field.value ?? '');
    $: if (text !== lastText) {
        lastText = text;
        const parsed = parseLoraTagText(text);
        rows = parsed.rows;
        rest = parsed.rest;
    }

    $: clipPrefMap = $svgenLayoutStore.loraClipStrength ?? {};
    $: showClipPref = clipPrefMap[nodeId] !== false;
    $: showClip = clipInputWired && showClipPref;
    $: rowIds = rows.map((r) => r.id);
    $: rowById = new Map(rows.map((r) => [r.id, r]));
    $: options = field.options?.values ?? [];

    function commit(nextRows: LoraTagRow[]) {
        const next = serializeLoraTagText(nextRows, rest, { includeClip: showClip });
        if (next === lastText)
            return;
        rows = nextRows;
        lastText = next;
        dispatch('change', next);
    }

    function patchRow(id: string, patch: Partial<LoraTagRow>) {
        commit(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    }

    function onStrength(id: string, raw: string, key: 'strength' | 'clipStrength') {
        const num = Number(raw);
        if (!Number.isFinite(num))
            return;
        const row = rowById.get(id);
        if (!row)
            return;
        if (key === 'strength' && !showClip) {
            if (row.strength === num && row.clipStrength === num)
                return;
            patchRow(id, { strength: num, clipStrength: num });
            return;
        }
        if (row[key] === num)
            return;
        patchRow(id, { [key]: num });
    }

    function removeRow(id: string) {
        commit(rows.filter((row) => row.id !== id));
    }

    function addRow() {
        commit([...rows, createEmptyLoraRow()]);
    }

    function onReorder(ids: string[]) {
        const next = ids.map((id) => rowById.get(id)).filter((r): r is LoraTagRow => !!r);
        if (next.length !== rows.length)
            return;
        commit(next);
    }

    function setClipPref(enabled: boolean) {
        const wasOn = ($svgenLayoutStore.loraClipStrength ?? {})[nodeId] !== false;
        if (wasOn === enabled)
            return;
        svgenLayoutStore.update((prev) => {
            const loraClipStrength = { ...(prev.loraClipStrength ?? {}) };
            if (enabled)
                delete loraClipStrength[nodeId];
            else
                loraClipStrength[nodeId] = false;
            return { ...prev, loraClipStrength };
        });
        dispatch('persistLayout');
        const next = serializeLoraTagText(rows, rest, {
            includeClip: clipInputWired && enabled,
        });
        if (next !== lastText) {
            lastText = next;
            dispatch('change', next);
        }
    }

    function disarmStrengthFlush() {
        if (!strengthFlushArmed)
            return;
        strengthFlushArmed = false;
        window.removeEventListener('pointerup', flushStrengthScrub);
        window.removeEventListener('pointercancel', flushStrengthScrub);
    }

    function flushStrengthScrub() {
        disarmStrengthFlush();
        if (!strengthScrubDirty)
            return;
        strengthScrubDirty = false;
        // Reassign once after scrub so Svelte picks up mutated strengths.
        rows = rows.map((row) => ({ ...row }));
        const next = serializeLoraTagText(rows, rest, { includeClip: showClip });
        if (next === lastText)
            return;
        lastText = next;
        dispatch('change', next);
    }

    function armStrengthFlush() {
        if (strengthFlushArmed)
            return;
        strengthFlushArmed = true;
        window.addEventListener('pointerup', flushStrengthScrub);
        window.addEventListener('pointercancel', flushStrengthScrub);
    }

    /**
     * During scrub: mutate only + arm flush. Do not dispatch / reassign `rows`
     * each step — parent + SortableList re-renders steal the gesture.
     * `numberDrag` already writes the input value (same action as SvGenField).
     */
    function onStrengthScrub(
        id: string,
        key: 'strength' | 'clipStrength',
        value: number,
    ) {
        const row = rowById.get(id);
        if (!row)
            return;
        row[key] = value;
        if (key === 'strength' && !showClip)
            row.clipStrength = value;
        strengthScrubDirty = true;
        armStrengthFlush();
    }

    function liveStrengthOverlays() {
        if (!rootEl)
            return [];
        const overlays: LoraStrengthOverlay[] = [];
        for (const el of rootEl.querySelectorAll('input.strength')) {
            if (!(el instanceof HTMLInputElement))
                continue;
            const id = el.dataset.loraRow;
            const key = el.dataset.loraKey;
            if (!id || (key !== 'strength' && key !== 'clipStrength'))
                continue;
            overlays.push({ id, key, raw: el.value });
        }
        return overlays;
    }

    function peekPendingWrite() {
        const next = serializeLoraTagText(
            overlayLoraRowStrengths(rows, liveStrengthOverlays(), showClip),
            rest,
            { includeClip: showClip },
        );
        if (next === String(field.value ?? ''))
            return null;
        return {
            nodeId: field.nodeId,
            widgetName: field.widgetName,
            value: next,
            valueIndex: field.valueIndex,
            writeMode: field.writeMode,
            innerNodeId: field.innerNodeId,
            outerValueIndex: field.outerValueIndex,
        };
    }

    const strengthDragByKey = new Map<string, NumberDragParams>();

    function strengthDrag(id: string, key: 'strength' | 'clipStrength'): NumberDragParams {
        const mapKey = `${id}\0${key}`;
        let params = strengthDragByKey.get(mapKey);
        if (!params) {
            params = {
                getValue: () => rowById.get(id)?.[key] ?? 0,
                getStep: () => STRENGTH_STEP,
                onChange: (value: number) => onStrengthScrub(id, key, value),
            };
            strengthDragByKey.set(mapKey, params);
        }
        return params;
    }

    $: {
        const live = new Set(rows.flatMap((r) => [
            `${r.id}\0strength`,
            `${r.id}\0clipStrength`,
        ]));
        for (const key of strengthDragByKey.keys()) {
            if (!live.has(key))
                strengthDragByKey.delete(key);
        }
    }

    const unregisterPendingPeek = registerPendingFieldPeek(peekPendingWrite);
    onDestroy(() => {
        unregisterPendingPeek();
        disarmStrengthFlush();
    });
</script>

<div class="lora-loader" class:editing={editMode} bind:this={rootEl}>
    {#if rows.length}
        {#if editMode}
            <SortableList
                ids={rowIds}
                axis="y"
                on:reorder={(e) => onReorder(e.detail.ids)}
                let:id
                let:startDrag
            >
                {@const row = rowById.get(id)}
                {#if row}
                    <SvGenLoraTagRow
                        {row}
                        {editMode}
                        {showClip}
                        {options}
                        fieldDomPrefix={field.nodeId}
                        strengthStep={STRENGTH_STEP}
                        {strengthDrag}
                        {startDrag}
                        onToggle={(enabled) => patchRow(row.id, { enabled })}
                        onName={(name) => patchRow(row.id, { name })}
                        onStrengthType={(raw, key) => onStrength(row.id, raw, key)}
                        onRemove={() => removeRow(row.id)}
                    />
                {/if}
            </SortableList>
        {:else}
            <div class="rows">
                {#each rows as row (row.id)}
                    <SvGenLoraTagRow
                        {row}
                        {editMode}
                        {showClip}
                        {options}
                        fieldDomPrefix={field.nodeId}
                        strengthStep={STRENGTH_STEP}
                        {strengthDrag}
                        onToggle={(enabled) => patchRow(row.id, { enabled })}
                        onName={(name) => patchRow(row.id, { name })}
                        onStrengthType={(raw, key) => onStrength(row.id, raw, key)}
                    />
                {/each}
            </div>
        {/if}
    {:else if !editMode}
        <div class="empty">No LoRAs</div>
    {/if}

    {#if editMode}
        <div class="edit-bar">
            {#if clipInputWired}
                <label class="clip-toggle">
                    <span>Clip strength</span>
                    <SvGenEnablePill
                        compact
                        checked={showClipPref}
                        title={showClipPref
                            ? 'Use separate CLIP strength'
                            : 'CLIP uses model strength'}
                        on:change={(e) => setClipPref(e.detail)}
                    />
                </label>
            {/if}
            <button type="button" class="triggers" on:click={() => (triggersOpen = true)}>
                Triggers
            </button>
            <button type="button" class="add" on:click={addRow}>Add LoRA</button>
        </div>
    {/if}
</div>

{#if triggersOpen}
    <SvGenLoraTriggersModal
        names={uniqueLoraNames(rows.map((row) => row.name))}
        on:close={() => (triggersOpen = false)}
    />
{/if}

<style lang="scss">
    .lora-loader {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        width: 100%;
    }

    .rows {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
    }

    .empty {
        font-size: 0.68rem;
        opacity: 0.5;
        font-style: italic;
        padding: 0.15rem 0;
    }

    .edit-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-top: 2px;
        flex-wrap: wrap;
    }

    .clip-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.65rem;
        font-weight: 600;
        color: var(--muted);
        cursor: pointer;
        user-select: none;
    }

    .triggers {
        appearance: none;
        border: none;
        background: transparent;
        color: var(--muted);
        font-size: 0.68rem;
        font-weight: 600;
        line-height: 1;
        padding: 0.35rem 0.25rem;
        cursor: pointer;

        &:hover {
            color: var(--accent);
        }
    }

    .add {
        appearance: none;
        border: none;
        border-radius: 0.4em;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.68rem;
        font-weight: 600;
        line-height: 1;
        padding: 0.35rem 0.55rem;
        cursor: pointer;
        margin-left: auto;

        &:hover {
            filter: brightness(1.08);
        }
    }

    :global(.lora-loader .sortable-item),
    :global(.lora-loader .sortable-item-body) {
        min-width: 0;
        width: 100%;
    }

    :global(.lora-loader .sortable-list.axis-y) {
        gap: 4px;
    }
</style>
