import assert from "node:assert/strict";
import {
    MasonryPlacer,
    applyColumnOrder,
    computeColumnCount,
    computeDirtyIndex,
    estimateItemHeight,
    sortColumnsByFirstItemIndex,
    type MasonryColumn,
} from "../src/lib/tools/masonryLayout.ts";
import type { ClientImage } from "../src/lib/types/images.ts";

function img(id: string, width?: number, height?: number): ClientImage {
    return { id, url: id, width, height };
}

function columnIds(columns: MasonryColumn[]): string[][] {
    return columns.map((column) => column.items.map((item) => item.id));
}

assert.equal(computeColumnCount(1000, 200, 16), 4);

assert.equal(
    estimateItemHeight(img("a", 1000, 2000), 250, 16),
    250 * 2 + 16,
);

assert.equal(computeDirtyIndex(["a", "b", "c"], ["a", "b", "c"]), 3);
assert.equal(computeDirtyIndex(["a", "b"], ["a", "b", "c", "d"]), 2);
assert.equal(computeDirtyIndex(["a", "b", "c"], ["x", "b", "c"]), 0);
assert.equal(computeDirtyIndex(["a", "b", "c"], ["a", "c"]), 1);

const placer = new MasonryPlacer();
const metrics = { columnCount: 3, columnWidth: 200, gap: 16 };

const first = placer.layout(
    [img("1", 100, 200), img("2", 100, 100), img("3", 100, 300)],
    "session-1",
    metrics,
);
assert.deepEqual(columnIds(first), [["1"], ["2"], ["3"]]);

const firstRowPlacer = new MasonryPlacer();
const unevenFirstRow = firstRowPlacer.layout(
    [img("1", 100, 800), img("2", 100, 100), img("3", 100, 100)],
    "first-row-uneven",
    metrics,
);
assert.deepEqual(columnIds(unevenFirstRow), [["1"], ["2"], ["3"]]);

const second = placer.layout(
    [
        img("1", 100, 200),
        img("2", 100, 100),
        img("3", 100, 300),
        img("4", 100, 100),
    ],
    "session-1",
    metrics,
);
assert.deepEqual(columnIds(second), [["1"], ["2", "4"], ["3"]]);

const resized = placer.layout(
    [
        img("1", 100, 200),
        img("2", 100, 100),
        img("3", 100, 300),
        img("4", 100, 100),
    ],
    "session-1",
    { columnCount: 2, columnWidth: 300, gap: 16 },
);
assert.equal(resized.length, 2);
assert.equal(
    resized.flatMap((column) => column.items).length,
    4,
);

const prependPlacer = new MasonryPlacer();
prependPlacer.layout(
    [img("2", 100, 100), img("3", 100, 300), img("4", 100, 100)],
    "prepend",
    metrics,
);
const prepended = prependPlacer.layout(
    [
        img("1", 100, 200),
        img("2", 100, 100),
        img("3", 100, 300),
        img("4", 100, 100),
    ],
    "prepend",
    metrics,
);
assert.deepEqual(columnIds(prepended), [["1"], ["2", "4"], ["3"]]);

const deletePlacer = new MasonryPlacer();
deletePlacer.layout(
    [
        img("1", 100, 200),
        img("2", 100, 100),
        img("3", 100, 300),
        img("4", 100, 100),
        img("5", 100, 200),
    ],
    "delete",
    metrics,
);
const afterDelete = deletePlacer.layout(
    [
        img("1", 100, 200),
        img("3", 100, 300),
        img("4", 100, 100),
        img("5", 100, 200),
    ],
    "delete",
    metrics,
);
assert.equal(deletePlacer.getAssignment("1"), 0);
assert.equal(deletePlacer.getAssignment("3"), 1);
assert.deepEqual(columnIds(afterDelete), [["1"], ["3"], ["4", "5"]]);

const appendPlacer = new MasonryPlacer();
appendPlacer.layout(
    [img("1", 100, 200), img("2", 100, 100), img("3", 100, 300)],
    "append",
    metrics,
);
const assignmentsBeforeAppend = new Map([
    ["1", appendPlacer.getAssignment("1")!],
    ["2", appendPlacer.getAssignment("2")!],
    ["3", appendPlacer.getAssignment("3")!],
]);
const appended = appendPlacer.layout(
    [
        img("1", 100, 200),
        img("2", 100, 100),
        img("3", 100, 300),
        img("4", 100, 100),
    ],
    "append",
    metrics,
);
assert.equal(appendPlacer.getAssignment("1"), assignmentsBeforeAppend.get("1"));
assert.equal(appendPlacer.getAssignment("2"), assignmentsBeforeAppend.get("2"));
assert.equal(appendPlacer.getAssignment("3"), assignmentsBeforeAppend.get("3"));
assert.deepEqual(columnIds(appended), [["1"], ["2", "4"], ["3"]]);

const reorderPlacer = new MasonryPlacer();
reorderPlacer.layout(
    [img("1", 100, 200), img("2", 100, 100), img("3", 100, 300)],
    "reorder",
    metrics,
);
const reordered = reorderPlacer.layout(
    [img("2", 100, 100), img("1", 100, 200), img("3", 100, 300)],
    "reorder",
    metrics,
);
assert.deepEqual(columnIds(reordered), [["2"], ["1"], ["3"]]);

const columns: MasonryColumn[] = [
    { key: 0, items: [img("c", 100, 200)] },
    { key: 1, items: [img("a", 100, 100)] },
    { key: 2, items: [img("b", 100, 300)] },
];
const itemIndex = new Map([
    ["a", 0],
    ["b", 1],
    ["c", 2],
]);
assert.deepEqual(
    sortColumnsByFirstItemIndex(columns, itemIndex).map((column) =>
        column.items[0]?.id,
    ),
    ["a", "b", "c"],
);

assert.deepEqual(
    applyColumnOrder(columns, [1, 2, 0]).map((column) => column.items[0]?.id),
    ["a", "b", "c"],
);

console.log("masonryLayout.test.ts passed");
