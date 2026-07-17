import assert from 'node:assert/strict';
import { selectByTimeNeighbors } from '../src/lib/tools/mmrMath.ts';

const timePruned = selectByTimeNeighbors(
    [
        { id: 'a', embedding: new Float32Array([1, 0]) },
        { id: 'b', embedding: new Float32Array([1, 0]) },
        { id: 'c', embedding: new Float32Array([0, 1]) },
        { id: 'd', embedding: new Float32Array([0.1, 0.99]) },
    ],
    2,
);
assert.deepEqual(
    timePruned,
    ['b', 'd'],
    'recalculates adjacent distances after each time-neighbor pruning step',
);

console.log('prune.test.ts: all tests passed');
