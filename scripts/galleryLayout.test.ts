import assert from "node:assert/strict";
import {
    getVisibleTiles,
    layoutGridTiles,
    layoutMasonryTiles,
} from "../src/lib/tools/galleryLayout.ts";
import { MasonryPlacer } from "../src/lib/tools/masonryLayout.ts";
import type { ClientImage } from "../src/lib/types/images.ts";

function img(id: string, width?: number, height?: number): ClientImage {
    return { id, url: id, width, height };
}

const metrics = { columnCount: 3, columnWidth: 200, gap: 16 };

const grid = layoutGridTiles(
    [
        img("1", 100, 200),
        img("2", 100, 100),
        img("3", 100, 300),
        img("4", 100, 100),
    ],
    metrics,
);

assert.equal(grid.tiles.length, 4);
assert.equal(grid.byId.get("1")?.left, 0);
assert.equal(grid.byId.get("2")?.left, 216);
assert.equal(grid.byId.get("3")?.left, 432);
assert.equal(grid.byId.get("4")?.left, 0);
assert.equal(grid.byId.get("1")?.height, 400);
assert.equal(grid.byId.get("4")?.top, 600 + 16);
// Row 0 height is max(400, 200, 600) = 600
assert.equal(grid.totalHeight, 600 + 16 + 200);

const visible = getVisibleTiles(grid.tiles, 0, 100);
assert.deepEqual(
    visible.map((tile) => tile.id).sort(),
    ["1", "2", "3"],
);

const deepVisible = getVisibleTiles(grid.tiles, 500, 700);
assert.deepEqual(
    deepVisible.map((tile) => tile.id).sort(),
    ["3", "4"],
);

const placer = new MasonryPlacer();
const itemIndex = new Map([
    ["1", 0],
    ["2", 1],
    ["3", 2],
    ["4", 3],
]);
const masonry = layoutMasonryTiles(
    placer,
    [
        img("1", 100, 200),
        img("2", 100, 100),
        img("3", 100, 300),
        img("4", 100, 100),
    ],
    "session",
    metrics,
    { columnOrder: null, itemIndex, nearTop: true },
);

assert.equal(masonry.layout.tiles.length, 4);
assert.equal(masonry.columnOrder.length, 3);
// First three fill columns 0/1/2; 4 joins shortest (col 1 with height 200)
assert.equal(placer.getAssignment("4"), 1);
const tile4 = masonry.layout.byId.get("4");
const tile2 = masonry.layout.byId.get("2");
assert.ok(tile4 && tile2);
assert.equal(tile4.left, tile2.left);
assert.equal(tile4.top, tile2.height + metrics.gap);

const empty = layoutGridTiles([], metrics);
assert.equal(empty.totalHeight, 0);
assert.equal(empty.tiles.length, 0);

console.log("galleryLayout.test.ts passed");
