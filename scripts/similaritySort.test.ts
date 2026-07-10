import assert from "node:assert/strict";
import {
    orderIdsBySimilarityScore,
    transitionSimilaritySort,
} from "../src/lib/tools/similaritySort.ts";
import { hasSimilaritySearchParts } from "../src/lib/tools/searchParsing.ts";

assert.equal(hasSimilaritySearchParts("IMG misty forest"), true, "detects IMG search");
assert.equal(hasSimilaritySearchParts("SIMILAR image-id"), true, "detects prompt similarity search");
assert.equal(hasSimilaritySearchParts("TAG favorite"), false, "ignores ordinary searches");

const scores = new Map([
    ["low", 0.2],
    ["high", 0.9],
    ["middle", 0.5],
]);

assert.deepEqual(
    orderIdsBySimilarityScore(scores, "similar"),
    ["high", "middle", "low"],
    "orders similarity scores highest first",
);

assert.deepEqual(
    orderIdsBySimilarityScore(scores, "similar (inverse)"),
    ["low", "middle", "high"],
    "orders inverse similarity scores lowest first",
);

const entered = transitionSimilaritySort(
    "name",
    { active: false },
    true,
);
assert.deepEqual(
    entered,
    {
        sorting: "similar",
        state: { active: true, savedSorting: "name" },
    },
    "captures the normal sort and selects similarity on entry",
);

const edited = transitionSimilaritySort(
    "similar (inverse)",
    entered.state,
    true,
);
assert.deepEqual(
    edited,
    {
        sorting: "similar (inverse)",
        state: { active: true, savedSorting: "name" },
    },
    "preserves the selected sort during similarity-search edits",
);

assert.deepEqual(
    transitionSimilaritySort(edited.sorting, edited.state, false),
    {
        sorting: "name",
        state: { active: false },
    },
    "restores the original normal sort after the last similarity clause is removed",
);

console.log("similaritySort.test.ts: all tests passed");
