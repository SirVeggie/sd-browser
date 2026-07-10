import assert from 'node:assert/strict';
import {
    computeIntrinsicUniqueness,
    rankMmrFromEmbeddings,
} from '../src/lib/tools/mmrMath.ts';
import { mmrSettingsDefaults } from '../src/lib/types/mmr.ts';

const embeddings = new Map<string, Float32Array>([
    ['a', new Float32Array([1, 0, 0])],
    ['b', new Float32Array([0.99, 0.01, 0])],
    ['c', new Float32Array([0, 1, 0])],
]);

const uniqueness = computeIntrinsicUniqueness(embeddings);
assert.ok((uniqueness.get('c') ?? 0) > (uniqueness.get('a') ?? 0), 'isolates the orthogonal embedding');

const mmr = rankMmrFromEmbeddings(
    ['a', 'b', 'c'],
    embeddings,
    { resultCount: 2, candidateCount: 3 },
    mmrSettingsDefaults,
);
assert.equal(mmr.orderedIds.length, 2, 'returns the requested number of MMR results');
assert.notEqual(mmr.orderedIds[0], mmr.orderedIds[1], 'does not duplicate selections');
assert.equal(new Set(mmr.orderedIds).size, 2, 'keeps MMR results unique');

console.log('mmr.test.ts: all tests passed');
