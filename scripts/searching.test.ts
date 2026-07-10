import assert from 'node:assert/strict';
import {
    getPositiveSimilarSourceIds,
    parseSimilarSearchTarget,
    pinIdsToFront,
    parseMmrDirective,
    parseImgSimDirective,
    stripMmrParts,
    stripResultShapingParts,
    hasMmrSearchParts,
    hasImgSimSearchParts,
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

assert.deepEqual(
    parseMmrDirective('MMR 25'),
    { resultCount: 25, candidateCount: 250 },
    'parses MMR result count with default candidate multiplier',
);

assert.throws(
    () => parseMmrDirective('MMR'),
    /result count must be a positive integer/,
    'rejects MMR without a result count',
);

assert.equal(
    stripMmrParts('TAG favourite AND MMR 10'),
    'TAG favourite',
    'removes MMR clause from matcher input',
);

assert.equal(hasMmrSearchParts('MMR 10'), true, 'detects MMR search parts');

assert.deepEqual(
    parseImgSimDirective('IMGSIM 1000'),
    { resultCount: 1000 },
    'parses IMGSIM result count',
);

assert.throws(
    () => parseImgSimDirective('IMGSIM'),
    /result count must be a positive integer/,
    'rejects IMGSIM without a result count',
);

assert.throws(
    () => parseImgSimDirective('IMGSIM 10 20'),
    /only one number/,
    'rejects IMGSIM with extra numbers',
);

assert.equal(
    stripResultShapingParts('TAG favourite AND IMGSIM 10'),
    'TAG favourite',
    'removes IMGSIM clause from matcher input',
);

assert.equal(
    stripResultShapingParts('MMR 5 AND IMGSIM 10'),
    '',
    'removes both MMR and IMGSIM clauses from matcher input',
);

assert.equal(
    stripMmrParts('TAG favourite AND IMGSIM 10'),
    'TAG favourite',
    'stripMmrParts removes IMGSIM through result-shaping strip',
);

assert.equal(hasImgSimSearchParts('IMGSIM 10'), true, 'detects IMGSIM search parts');

assert.deepEqual(
    parseImgSimDirective('TAG landscape AND IMGSIM 25'),
    { resultCount: 25 },
    'parses IMGSIM position-independently',
);

console.log('searching.test.ts: all tests passed');
