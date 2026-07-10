import assert from "node:assert/strict";
import {
    MasonryPlacer,
    applyColumnOrder,
    computeColumnCount,
    estimateItemHeight,
    sortColumnsByFirstItemIndex,
    type MasonryColumn,
} from "../src/lib/tools/masonryLayout.ts";
import type { ClientImage } from "../src/lib/types/images.ts";

function img(id: string, width?: number, height?: number): ClientImage {
    return { id, url: id, width, height };
}

assert.equal(computeColumnCount(1000, 200, 16), 4);

assert.equal(
    estimateItemHeight(img("a", 1000, 2000), 250, 16),
    250 * 2 + 16,
);

const placer = new MasonryPlacer();
const metrics = { columnCount: 3, columnWidth: 200, gap: 16 };

const first = placer.layout(
    [img("1", 100, 200), img("2", 100, 100), img("3", 100, 300)],
    "session-1",
    metrics,
);
assert.deepEqual(
    first.map((column) => column.items.map((item) => item.id)),
    [["1"], ["2"], ["3"]],
);

const firstRowPlacer = new MasonryPlacer();
const unevenFirstRow = firstRowPlacer.layout(
    [img("1", 100, 800), img("2", 100, 100), img("3", 100, 100)],
    "first-row-uneven",
    metrics,
);
assert.deepEqual(
    unevenFirstRow.map((column) => column.items.map((item) => item.id)),
    [["1"], ["2"], ["3"]],
);

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
assert.deepEqual(
    second.map((column) => column.items.map((item) => item.id)),
    [["1"], ["2", "4"], ["3"]],
);

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

const restored = new MasonryPlacer();
restored.layout(
    [img("1", 100, 200), img("2", 100, 100), img("3", 100, 300)],
    "session-restore",
    metrics,
);
const originalColumn = restored.getAssignment("2");
restored.layout(
    [img("1", 100, 200), img("3", 100, 300)],
    "session-restore",
    metrics,
);
restored.setAssignment("2", originalColumn!);
const restoredColumns = restored.layout(
    [img("1", 100, 200), img("2", 100, 100), img("3", 100, 300)],
    "session-restore",
    metrics,
);
assert.equal(
    restoredColumns.find((column) => column.items.some((item) => item.id === "2"))?.key,
    originalColumn,
);

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
