import assert from "node:assert/strict";
import {
    reorderItems,
    targetIndexFromPointer,
    type SortableRect,
} from "../src/lib/tools/sortableGeometry.ts";

assert.deepEqual(reorderItems(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
assert.deepEqual(reorderItems(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
assert.deepEqual(reorderItems(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
assert.deepEqual(reorderItems(["a", "b", "c"], -1, 0), ["a", "b", "c"]);

const stack: SortableRect[] = [
    { left: 0, top: 0, width: 100, height: 40 },
    { left: 0, top: 50, width: 100, height: 40 },
    { left: 0, top: 100, width: 100, height: 40 },
    { left: 0, top: 150, width: 100, height: 40 },
];

// Drag item 1; pointer in the gap between item 2 and 3 (y=145) — still resolves
assert.equal(
    targetIndexFromPointer({
        axis: "y",
        pointerX: 50,
        pointerY: 145,
        rects: stack,
        fromIndex: 1,
    }),
    2,
);

// Drag last item to top
assert.equal(
    targetIndexFromPointer({
        axis: "y",
        pointerX: 50,
        pointerY: 5,
        rects: stack,
        fromIndex: 3,
    }),
    0,
);

// Drag first item past the bottom
assert.equal(
    targetIndexFromPointer({
        axis: "y",
        pointerX: 50,
        pointerY: 200,
        rects: stack,
        fromIndex: 0,
    }),
    3,
);

const wrapRow: SortableRect[] = [
    { left: 0, top: 0, width: 60, height: 24 },
    { left: 70, top: 0, width: 60, height: 24 },
    { left: 140, top: 0, width: 60, height: 24 },
    { left: 0, top: 40, width: 60, height: 24 },
];

// Pointer in horizontal gap between first and second pill
assert.equal(
    targetIndexFromPointer({
        axis: "xy",
        pointerX: 65,
        pointerY: 12,
        rects: wrapRow,
        fromIndex: 2,
    }),
    1,
);

// Pointer in vertical gap between rows — after first row items
assert.equal(
    targetIndexFromPointer({
        axis: "xy",
        pointerX: 30,
        pointerY: 32,
        rects: wrapRow,
        fromIndex: 3,
    }),
    3,
);

console.log("sortableGeometry.test.ts passed");
