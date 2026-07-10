import assert from "node:assert/strict";
import { fitContextMenuToViewport } from "../src/lib/items/contextMenuPosition.ts";

Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { innerWidth: 1024, innerHeight: 768 },
});

assert.deepEqual(
    fitContextMenuToViewport({ x: 100, y: 740, width: 200, height: 100 }),
    { x: 100, y: 660, flipLeft: false },
);

assert.deepEqual(
    fitContextMenuToViewport({ x: 100, y: 700, width: 200, height: 1000 }),
    { x: 100, y: 8, flipLeft: false },
);

assert.deepEqual(
    fitContextMenuToViewport({
        x: 900,
        y: 100,
        width: 240,
        height: 100,
        parentLeft: 800,
    }),
    { x: 560, y: 100, flipLeft: true },
);

console.log("contextMenuPosition.test.ts passed");
