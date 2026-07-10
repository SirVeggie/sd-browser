import assert from 'node:assert/strict';
import {
    getPositiveSimilarSourceIds,
    parseSimilarSearchTarget,
    pinIdsToFront,
} from '../src/lib/tools/searchParsing.ts';

assert.deepEqual(
    parseSimilarSearchTarget('abc123'),
    { imageId: 'abc123', threshold: undefined, mode: 'prompt' },
    'parses prompt similar id',
);

assert.deepEqual(
    parseSimilarSearchTarget('abc123 0.6'),
    { imageId: 'abc123', threshold: 0.6, mode: 'prompt' },
    'parses prompt similar id with threshold',
);

assert.deepEqual(
    parseSimilarSearchTarget('img abc123'),
    { imageId: 'abc123', threshold: undefined, mode: 'embedding' },
    'parses image similar id',
);

assert.deepEqual(
    parseSimilarSearchTarget('img abc123 0.8'),
    { imageId: 'abc123', threshold: 0.8, mode: 'embedding' },
    'parses image similar id with threshold',
);

assert.deepEqual(
    parseSimilarSearchTarget('SIMILAR img abc123 0.8'),
    { imageId: 'abc123', threshold: 0.8, mode: 'embedding' },
    'parses full image similar command with threshold',
);

assert.deepEqual(
    parseSimilarSearchTarget('NOT SIMILAR img abc123'),
    { imageId: 'abc123', threshold: undefined, mode: 'embedding' },
    'preserves image mode when stripping a negated similar prefix',
);

assert.deepEqual(
    parseSimilarSearchTarget('IMG xyz 0.12'),
    { imageId: 'xyz', threshold: 0.12, mode: 'embedding' },
    'parses image similar case-insensitively',
);

assert.deepEqual(
    parseSimilarSearchTarget('img id-with-dashes'),
    { imageId: 'id-with-dashes', threshold: undefined, mode: 'embedding' },
    'parses image similar id containing dashes',
);

assert.deepEqual(
    getPositiveSimilarSourceIds('SIMILAR abc AND landscape'),
    ['abc'],
    'collects positive similar source ids',
);

assert.deepEqual(
    getPositiveSimilarSourceIds('NOT SIMILAR abc AND SIMILAR img def'),
    ['def'],
    'ignores negated similar clauses',
);

assert.deepEqual(
    pinIdsToFront(['b', 'c', 'a'], ['a', 'b']),
    ['a', 'b', 'c'],
    'pins source ids to the front without duplicates',
);

console.log('searching.test.ts: all tests passed');
