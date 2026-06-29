import assert from 'node:assert/strict';
import type { ServerImage } from '../src/lib/types/images.ts';
import {
    buildUniqueHashToId,
    repairUniqueHashToIdAfterDeletes,
} from '../src/lib/server/explorationUnique.ts';

function image(id: string, modifiedDate: number, hash: string): ServerImage {
    return {
        id,
        file: '',
        folder: '',
        modifiedDate,
        createdDate: 0,
        preview: '',
        positive: '',
        negative: '',
        params: '',
        models: '[]',
        hash,
        annotation: '',
    };
}

const duplicateA = image('older', 1, 'hash-a');
const duplicateB = image('newer', 2, 'hash-a');
const uniqueC = image('solo', 3, 'hash-b');

assert.deepEqual(
    buildUniqueHashToId([duplicateA, duplicateB, uniqueC]),
    { 'hash-a': 'newer', 'hash-b': 'solo' },
    'build keeps newest image per hash',
);

assert.deepEqual(
    buildUniqueHashToId([
        duplicateA,
        duplicateB,
        image('newest', 3, 'hash-a'),
        uniqueC,
    ]),
    { 'hash-a': 'newest', 'hash-b': 'solo' },
    'add overwrites hash entry when rebuilding',
);

const built = buildUniqueHashToId([duplicateA, duplicateB, uniqueC]);

assert.deepEqual(
    repairUniqueHashToIdAfterDeletes(built, [duplicateB, uniqueC], [duplicateA]),
    { 'hash-a': 'newer', 'hash-b': 'solo' },
    'delete non-representative leaves map unchanged',
);

assert.deepEqual(
    repairUniqueHashToIdAfterDeletes(built, [duplicateA, uniqueC], [duplicateB]),
    { 'hash-a': 'older', 'hash-b': 'solo' },
    'delete representative picks next-newest',
);

assert.deepEqual(
    repairUniqueHashToIdAfterDeletes(built, [uniqueC], [duplicateA, duplicateB]),
    { 'hash-b': 'solo' },
    'delete last duplicate removes hash key',
);

assert.deepEqual(
    buildUniqueHashToId([image('no-hash', 1, '')]),
    {},
    'images without hash are skipped',
);

console.log('exploration.unique tests passed');
