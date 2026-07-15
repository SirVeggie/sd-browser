<script lang="ts">
    import { createEventDispatcher, onDestroy, tick } from "svelte";
    import {
        rectFromDOM,
        reorderItems,
        targetIndexFromPointer,
        type SortAxis,
    } from "$lib/tools/sortableGeometry";

    /** Stable ids in current committed order. */
    export let ids: string[] = [];
    export let axis: SortAxis = "y";
    export let disabled = false;
    /** Root element role — use "list" for filter cards. */
    export let role: "list" | "group" | undefined = undefined;

    const dispatch = createEventDispatcher<{
        reorder: { from: number; to: number; ids: string[] };
    }>();

    let visualIds: string[] = [];

    let dragging = false;
    let dragIndex = -1;
    let dragId: string | null = null;
    let pointerId = -1;
    let grabOffsetX = 0;
    let grabOffsetY = 0;
    let ghostX = 0;
    let ghostY = 0;
    let ghostW = 0;
    let ghostH = 0;
    let originIds: string[] = [];

    const itemEls = new Map<string, HTMLElement>();

    $: if (!dragging) {
        visualIds = [...ids];
    }

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

    function measureRects(order: string[]) {
        return order.map((id) => {
            const el = itemEls.get(id);
            if (!el) return { left: 0, top: 0, width: 0, height: 0 };
            return rectFromDOM(el.getBoundingClientRect());
        });
    }

    async function flip(prev: Map<string, DOMRect>) {
        await tick();
        for (const id of visualIds) {
            const el = itemEls.get(id);
            if (!el || id === dragId) continue;
            const first = prev.get(id);
            if (!first) continue;
            const last = el.getBoundingClientRect();
            const dx = first.left - last.left;
            const dy = first.top - last.top;
            if (dx === 0 && dy === 0) continue;
            el.style.transition = "none";
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            void el.offsetWidth;
            el.style.transition = "transform 180ms ease";
            el.style.transform = "";
        }
    }

    function clearFlipStyles() {
        for (const el of itemEls.values()) {
            el.style.transition = "";
            el.style.transform = "";
        }
    }

    function onHandlePointerDown(event: PointerEvent, index: number) {
        if (disabled || dragging) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;

        const id = visualIds[index];
        const el = itemEls.get(id);
        if (!el) return;

        event.preventDefault();
        event.stopPropagation();

        const rect = el.getBoundingClientRect();
        originIds = [...visualIds];
        dragging = true;
        dragIndex = index;
        dragId = id;
        pointerId = event.pointerId;
        grabOffsetX = event.clientX - rect.left;
        grabOffsetY = event.clientY - rect.top;
        ghostW = rect.width;
        ghostH = rect.height;
        ghostX = rect.left;
        ghostY = rect.top;

        const handle = event.currentTarget as HTMLElement;
        handle.setPointerCapture(event.pointerId);

        addWindowListeners();
    }

    function addWindowListeners() {
        if (typeof window === "undefined") return;
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
        window.addEventListener("keydown", onKeyDown);
    }

    function removeWindowListeners() {
        if (typeof window === "undefined") return;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        window.removeEventListener("keydown", onKeyDown);
    }

    function onPointerMove(event: PointerEvent) {
        if (!dragging || event.pointerId !== pointerId) return;

        ghostX = event.clientX - grabOffsetX;
        ghostY = event.clientY - grabOffsetY;

        const rects = measureRects(visualIds);
        const to = targetIndexFromPointer({
            axis,
            pointerX: event.clientX,
            pointerY: event.clientY,
            rects,
            fromIndex: dragIndex,
        });

        if (to === dragIndex) return;

        const prev = new Map<string, DOMRect>();
        for (const id of visualIds) {
            const node = itemEls.get(id);
            if (node) prev.set(id, node.getBoundingClientRect());
        }

        visualIds = reorderItems(visualIds, dragIndex, to);
        dragIndex = to;
        void flip(prev);
    }

    function finishDrag(commit: boolean) {
        if (!dragging) return;

        removeWindowListeners();

        const from = originIds.indexOf(dragId!);
        const to = dragIndex;
        const nextIds = commit ? [...visualIds] : [...originIds];

        clearFlipStyles();
        dragIndex = -1;
        dragId = null;
        pointerId = -1;

        // Dispatch before clearing `dragging` so parent store updates sync into
        // `ids` before the reactive reset runs.
        if (commit && from >= 0 && from !== to) {
            visualIds = nextIds;
            dispatch("reorder", { from, to, ids: nextIds });
        } else {
            visualIds = nextIds;
        }

        dragging = false;
    }

    function startDragFor(index: number) {
        return (event: PointerEvent) => onHandlePointerDown(event, index);
    }

    function onPointerUp(event: PointerEvent) {
        if (event.pointerId !== pointerId) return;
        finishDrag(true);
    }

    function onPointerCancel(event: PointerEvent) {
        if (event.pointerId !== pointerId) return;
        finishDrag(false);
    }

    function onKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            finishDrag(false);
        }
    }

    onDestroy(() => {
        removeWindowListeners();
    });
</script>

<div
    class="sortable-list"
    class:axis-y={axis === "y"}
    class:axis-xy={axis === "xy"}
    class:is-dragging={dragging}
    {role}
>
    {#each visualIds as id, index (id)}
        <div
            class="sortable-item"
            class:lifted={dragging && id === dragId}
            style={dragging && id === dragId
                ? `width:${ghostW}px;height:${ghostH}px`
                : undefined}
            data-id={id}
            role={role === "list" ? "listitem" : undefined}
            use:itemAction={id}
        >
            <div
                class="sortable-item-body"
                class:ghost={dragging && id === dragId}
                style={dragging && id === dragId
                    ? `width:${ghostW}px;transform:translate(${ghostX}px, ${ghostY}px)`
                    : undefined}
            >
                <slot
                    {id}
                    {index}
                    dragging={dragging && id === dragId}
                    startDrag={startDragFor(index)}
                />
            </div>
        </div>
    {/each}
    <slot name="trailing" />
</div>

<style lang="scss">
    .sortable-list {
        &.axis-y {
            display: flex;
            flex-direction: column;
            gap: inherit;
            align-items: stretch;

            .sortable-item,
            .sortable-item-body {
                width: 100%;
                display: block;
            }
        }

        &.axis-xy {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: inherit;

            .sortable-item,
            .sortable-item-body {
                display: flex;
                align-items: center;
            }
        }

        &.is-dragging {
            user-select: none;
            touch-action: none;
        }
    }

    .sortable-item {
        position: relative;
        min-width: 0;

        &.lifted {
            flex-shrink: 0;

            &::before {
                content: "";
                position: absolute;
                inset: 0;
                border: 1px dashed #6668;
                border-radius: 6px;
                pointer-events: none;
            }
        }
    }

    .sortable-item-body {
        &.ghost {
            position: fixed;
            left: 0;
            top: 0;
            z-index: 1000;
            pointer-events: none;
            margin: 0;
            box-shadow: 0 8px 24px #0008;
            will-change: transform;
        }
    }
</style>
