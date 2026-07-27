<script lang="ts">
    import { createEventDispatcher, onDestroy, tick } from 'svelte';
    import { overlayScrollbar } from '../../../actions/overlayScrollbar';
    import {
        rectFromDOM,
        targetIndexFromPointer,
    } from '$lib/tools/sortableGeometry';
    import type { ColumnPlacement, SvgenCard } from '$lib/svgen/types';
    import SvGenCard from './SvGenCard.svelte';

    export let cards: SvgenCard[] = [];
    export let placement: ColumnPlacement;
    export let collapsedNodeIds: string[] = [];

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
        columnsChange: { columns: string[][] };
        fieldOrder: { nodeId: string; order: string[] };
        hideField: { nodeId: string; widgetName: string };
        persistLayout: void;
    }>();

    $: cardMap = new Map(cards.map((c) => [c.nodeId, c]));
    $: collapsed = new Set(collapsedNodeIds);

    let visualColumns: string[][] = [];
    let dragging = false;
    let dragId: string | null = null;
    let dragCol = -1;
    let dragIndex = -1;
    let pointerId = -1;
    let grabOffsetX = 0;
    let grabOffsetY = 0;
    let ghostX = 0;
    let ghostY = 0;
    let ghostW = 0;
    let ghostH = 0;
    let originColumns: string[][] = [];
    let lastPointerX = 0;
    let lastPointerY = 0;
    let autoScrollRaf = 0;

    /** Distance from column edge that triggers scroll while dragging. */
    const AUTO_SCROLL_EDGE_PX = 56;
    /** Max scroll speed (px/frame) at the extreme edge. */
    const AUTO_SCROLL_MAX_PX = 18;

    const itemEls = new Map<string, HTMLElement>();
    const columnEls: HTMLElement[] = [];

    $: if (!dragging)
        visualColumns = placement.columns.map((col) => col.slice());

    function itemAction(node: HTMLElement, id: string) {
        itemEls.set(id, node);
        return {
            update(nextId: string) {
                itemEls.delete(id);
                id = nextId;
                itemEls.set(id, node);
            },
            destroy() {
                itemEls.delete(id);
            },
        };
    }

    function columnAction(node: HTMLElement, index: number) {
        columnEls[index] = node;
        return {
            update(nextIndex: number) {
                if (columnEls[index] === node)
                    delete columnEls[index];
                index = nextIndex;
                columnEls[index] = node;
            },
            destroy() {
                if (columnEls[index] === node)
                    delete columnEls[index];
            },
        };
    }

    function columnUnderPointer(clientX: number): number {
        let best = dragCol >= 0 ? dragCol : 0;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < visualColumns.length; i++) {
            const el = columnEls[i];
            if (!el)
                continue;
            const rect = el.getBoundingClientRect();
            if (clientX >= rect.left && clientX <= rect.right)
                return i;
            const cx = rect.left + rect.width / 2;
            const dist = Math.abs(clientX - cx);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    async function flip(prev: Map<string, DOMRect>) {
        await tick();
        for (const col of visualColumns) {
            for (const id of col) {
                const el = itemEls.get(id);
                if (!el || id === dragId)
                    continue;
                const first = prev.get(id);
                if (!first)
                    continue;
                const last = el.getBoundingClientRect();
                const dx = first.left - last.left;
                const dy = first.top - last.top;
                if (dx === 0 && dy === 0)
                    continue;
                el.style.transition = 'none';
                el.style.transform = `translate(${dx}px, ${dy}px)`;
                void el.offsetWidth;
                el.style.transition = 'transform 180ms ease';
                el.style.transform = '';
            }
        }
    }

    function clearFlipStyles() {
        for (const el of itemEls.values()) {
            el.style.transition = '';
            el.style.transform = '';
        }
    }

    function snapshotRects() {
        const prev = new Map<string, DOMRect>();
        for (const [id, node] of itemEls) {
            prev.set(id, node.getBoundingClientRect());
        }
        return prev;
    }

    function applyColumns(next: string[][], nextCol: number, nextIndex: number) {
        if (nextCol === dragCol && nextIndex === dragIndex) {
            const same = next.every((col, i) =>
                col.length === visualColumns[i]?.length
                && col.every((id, j) => id === visualColumns[i][j]));
            if (same)
                return;
        }
        const prev = snapshotRects();
        visualColumns = next;
        dragCol = nextCol;
        dragIndex = nextIndex;
        void flip(prev);
    }

    /** Pointer-based insert index in a column that does not currently hold the drag item. */
    function insertIndexInColumn(colIds: string[], pointerY: number): number {
        let to = 0;
        for (const id of colIds) {
            const el = itemEls.get(id);
            if (!el)
                continue;
            const rect = el.getBoundingClientRect();
            if (pointerY > rect.top + rect.height / 2)
                to++;
        }
        return to;
    }

    function scrollElForColumn(colIndex: number): HTMLElement | null {
        const shell = columnEls[colIndex];
        return shell?.querySelector<HTMLElement>('[data-overlay-scroll]') ?? null;
    }

    /** Signed px/frame: negative = up, positive = down. */
    function autoScrollDelta(clientY: number, scrollEl: HTMLElement): number {
        const rect = scrollEl.getBoundingClientRect();
        const topDist = clientY - rect.top;
        const botDist = rect.bottom - clientY;
        if (topDist < AUTO_SCROLL_EDGE_PX) {
            const t = 1 - Math.max(0, topDist) / AUTO_SCROLL_EDGE_PX;
            return -AUTO_SCROLL_MAX_PX * t * t;
        }
        if (botDist < AUTO_SCROLL_EDGE_PX) {
            const t = 1 - Math.max(0, botDist) / AUTO_SCROLL_EDGE_PX;
            return AUTO_SCROLL_MAX_PX * t * t;
        }
        return 0;
    }

    function stopAutoScroll() {
        if (!autoScrollRaf)
            return;
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = 0;
    }

    function tickAutoScroll() {
        autoScrollRaf = 0;
        if (!dragging || !dragId)
            return;

        const toCol = columnUnderPointer(lastPointerX);
        const scrollEl = scrollElForColumn(toCol);
        if (scrollEl) {
            const delta = autoScrollDelta(lastPointerY, scrollEl);
            if (delta !== 0) {
                const before = scrollEl.scrollTop;
                scrollEl.scrollTop = before + delta;
                if (scrollEl.scrollTop !== before)
                    updateDropFromPointer(lastPointerX, lastPointerY);
            }
        }

        autoScrollRaf = requestAnimationFrame(tickAutoScroll);
    }

    function startAutoScroll() {
        if (autoScrollRaf)
            return;
        autoScrollRaf = requestAnimationFrame(tickAutoScroll);
    }

    function updateDropFromPointer(clientX: number, clientY: number) {
        if (!dragId)
            return;

        const toCol = columnUnderPointer(clientX);
        const without = visualColumns.map((col) => col.filter((id) => id !== dragId));

        if (toCol === dragCol) {
            const order = visualColumns[dragCol];
            const rects = order.map((id) => {
                const el = itemEls.get(id);
                if (!el)
                    return { left: 0, top: 0, width: 0, height: 0 };
                return rectFromDOM(el.getBoundingClientRect());
            });
            const to = targetIndexFromPointer({
                axis: 'y',
                pointerX: clientX,
                pointerY: clientY,
                rects,
                fromIndex: dragIndex,
            });
            if (to === dragIndex)
                return;
            const next = visualColumns.map((col) => col.slice());
            const [item] = next[dragCol].splice(dragIndex, 1);
            next[dragCol].splice(to, 0, item);
            applyColumns(next, dragCol, to);
            return;
        }

        const insertAt = insertIndexInColumn(without[toCol], clientY);
        const next = without.map((col) => col.slice());
        next[toCol].splice(insertAt, 0, dragId);
        applyColumns(next, toCol, insertAt);
    }

    function onHandlePointerDown(nodeId: string, event: PointerEvent) {
        if (dragging)
            return;
        if (event.pointerType === 'mouse' && event.button !== 0)
            return;

        let colIndex = -1;
        let index = -1;
        for (let c = 0; c < visualColumns.length; c++) {
            const i = visualColumns[c].indexOf(nodeId);
            if (i >= 0) {
                colIndex = c;
                index = i;
                break;
            }
        }
        const el = itemEls.get(nodeId);
        if (colIndex < 0 || index < 0 || !el)
            return;

        event.preventDefault();
        event.stopPropagation();

        const rect = el.getBoundingClientRect();
        originColumns = visualColumns.map((col) => col.slice());
        dragging = true;
        dragId = nodeId;
        dragCol = colIndex;
        dragIndex = index;
        pointerId = event.pointerId;
        grabOffsetX = event.clientX - rect.left;
        grabOffsetY = event.clientY - rect.top;
        ghostW = rect.width;
        ghostH = rect.height;
        ghostX = rect.left;
        ghostY = rect.top;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;

        const handle = event.currentTarget as HTMLElement;
        handle.setPointerCapture(event.pointerId);
        addWindowListeners();
        startAutoScroll();
    }

    function startDragFor(nodeId: string) {
        return (event: PointerEvent) => onHandlePointerDown(nodeId, event);
    }

    function addWindowListeners() {
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerCancel);
        window.addEventListener('keydown', onKeyDown);
    }

    function removeWindowListeners() {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        window.removeEventListener('keydown', onKeyDown);
    }

    function onPointerMove(event: PointerEvent) {
        if (!dragging || event.pointerId !== pointerId || !dragId)
            return;

        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        ghostX = event.clientX - grabOffsetX;
        ghostY = event.clientY - grabOffsetY;
        updateDropFromPointer(event.clientX, event.clientY);
    }

    function finishDrag(commit: boolean) {
        if (!dragging)
            return;

        stopAutoScroll();
        removeWindowListeners();
        clearFlipStyles();

        const nextColumns = commit
            ? visualColumns.map((col) => col.slice())
            : originColumns.map((col) => col.slice());

        const changed = commit && JSON.stringify(nextColumns) !== JSON.stringify(originColumns);

        dragIndex = -1;
        dragCol = -1;
        dragId = null;
        pointerId = -1;
        visualColumns = nextColumns;
        dragging = false;

        if (changed)
            dispatch('columnsChange', { columns: nextColumns });
    }

    function onPointerUp(event: PointerEvent) {
        if (event.pointerId !== pointerId)
            return;
        finishDrag(true);
    }

    function onPointerCancel(event: PointerEvent) {
        if (event.pointerId !== pointerId)
            return;
        finishDrag(false);
    }

    function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            finishDrag(false);
        }
    }

    onDestroy(() => {
        stopAutoScroll();
        removeWindowListeners();
    });
</script>

<div class="columns" class:is-dragging={dragging} style={`--cols: ${visualColumns.length}`}>
    {#each visualColumns as col, colIndex}
        <div class="column-shell" use:overlayScrollbar use:columnAction={colIndex}>
            <div class="column" data-overlay-scroll role="list">
                {#each col as nodeId (nodeId)}
                    {@const card = cardMap.get(nodeId)}
                    {#if card}
                        <div
                            class="slot"
                            class:lifted={dragging && nodeId === dragId}
                            style={dragging && nodeId === dragId
                                ? `width:${ghostW}px;height:${ghostH}px`
                                : undefined}
                            role="listitem"
                            use:itemAction={nodeId}
                        >
                            <div
                                class="slot-body"
                                class:ghost={dragging && nodeId === dragId}
                                style={dragging && nodeId === dragId
                                    ? `width:${ghostW}px;transform:translate(${ghostX}px, ${ghostY}px)`
                                    : undefined}
                            >
                                <SvGenCard
                                    {card}
                                    columnIndex={colIndex}
                                    collapsed={collapsed.has(nodeId)}
                                    startDrag={startDragFor(nodeId)}
                                    on:fieldChange
                                    on:toggleCollapse
                                    on:fieldOrder
                                    on:hideField
                                    on:persistLayout
                                />
                            </div>
                        </div>
                    {/if}
                {/each}
                {#if !col.length}
                    <div class="empty-col">Drop cards here</div>
                {/if}
            </div>
        </div>
    {/each}
</div>

<style lang="scss">
    .columns {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
        gap: 0.35rem;
        padding: 0.4rem 0.45rem;
        /* Allow overlay thumbs shifted into the gap / outer padding. */
        overflow: visible;

        &.is-dragging {
            user-select: none;
            touch-action: none;
        }
    }

    .column-shell {
        position: relative;
        min-height: 0;
        display: flex;
        flex-direction: column;
        border-radius: 8px;
        background: color-mix(in srgb, var(--bg) 92%, var(--line));

        /* Park the thumb in the column gap / outer edge, not over cards. */
        :global(.overlay-scrollbar-track) {
            right: -0.4rem;
        }
    }

    .column {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.12rem;
        border-radius: 8px;
    }

    .slot {
        position: relative;
        flex-shrink: 0;
        min-width: 0;

        &.lifted::before {
            content: '';
            position: absolute;
            inset: 0;
            border: 1px dashed color-mix(in srgb, var(--ink) 35%, transparent);
            border-radius: 12px;
            pointer-events: none;
        }
    }

    .slot-body {
        &.ghost {
            position: fixed;
            left: 0;
            top: 0;
            z-index: 1000;
            pointer-events: none;
            margin: 0;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
            will-change: transform;
        }
    }

    .empty-col {
        margin: auto;
        opacity: 0.4;
        font-size: 0.8rem;
        padding: 1rem;
        text-align: center;
        pointer-events: none;
    }
</style>
