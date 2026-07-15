export type SortAxis = "y" | "xy";

export type SortableRect = {
    left: number;
    top: number;
    width: number;
    height: number;
};

/**
 * Move `from` → `to` where `to` is the index after removing the item
 * (same convention as splice-out then splice-in).
 */
export function reorderItems<T>(items: readonly T[], from: number, to: number): T[] {
    if (from === to) return [...items];
    if (from < 0 || to < 0 || from >= items.length || to >= items.length) {
        return [...items];
    }
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

function isPointerAfterRectY(pointerY: number, rect: SortableRect): boolean {
    return pointerY > rect.top + rect.height / 2;
}

/**
 * Reading-order "after" test for wrapping rows. Uses the item box so vertical
 * gaps between rows still map to a slot (never elementFromPoint).
 */
function isPointerAfterRectXY(pointerX: number, pointerY: number, rect: SortableRect): boolean {
    const midX = rect.left + rect.width / 2;
    const bottom = rect.top + rect.height;
    if (pointerY > bottom) return true;
    if (pointerY < rect.top) return false;
    return pointerX > midX;
}

/**
 * Gap-tolerant insert index: counts how many siblings the pointer is "after"
 * in list order, ignoring the dragged item.
 */
export function targetIndexFromPointer(args: {
    axis: SortAxis;
    pointerX: number;
    pointerY: number;
    rects: ReadonlyArray<SortableRect>;
    fromIndex: number;
}): number {
    const { axis, pointerX, pointerY, rects, fromIndex } = args;
    const n = rects.length;
    if (n <= 1) return 0;
    if (fromIndex < 0 || fromIndex >= n) return 0;

    let to = 0;
    for (let i = 0; i < n; i++) {
        if (i === fromIndex) continue;
        const rect = rects[i];
        const after =
            axis === "y"
                ? isPointerAfterRectY(pointerY, rect)
                : isPointerAfterRectXY(pointerX, pointerY, rect);
        if (after) to++;
    }
    return to;
}

export function rectFromDOM(domRect: DOMRect | DOMRectReadOnly): SortableRect {
    return {
        left: domRect.left,
        top: domRect.top,
        width: domRect.width,
        height: domRect.height,
    };
}
