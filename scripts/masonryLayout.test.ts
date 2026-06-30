import assert from "node:assert/strict";
import {
    MasonryPlacer,
    computeColumnCount,
    estimateItemHeight,
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

console.log("masonryLayout.test.ts passed");
