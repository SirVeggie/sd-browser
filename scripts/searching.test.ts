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
    splitSearchParts,
    tokenizeSearchClauses,
    unescapeSearchLiterals,
    parseWeightedImgQueryClauses,
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

assert.equal(
    stripMmrParts('TAG favourite MMR 10'),
    'TAG favourite',
    'removes implicitly chained MMR clause from matcher input',
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

assert.deepEqual(
    parseImgSimDirective('TAG landscape IMGSIM 25'),
    { resultCount: 25 },
    'parses implicitly chained IMGSIM',
);

const splitCases: Array<{ search: string; parts: string[] }> = [
    { search: 'red hair AND man', parts: ['red hair', 'man'] },
    { search: 'red hair man', parts: ['red hair man'] },
    { search: 'landscape FOLDER txt2img', parts: ['landscape', 'FOLDER txt2img'] },
    { search: 'red NOT FOLDER drafts', parts: ['red', 'NOT FOLDER drafts'] },
    { search: 'DT -1y TO -6m landscape', parts: ['DT -1y TO -6m', 'landscape'] },
    { search: 'landscape IMG misty forest', parts: ['landscape', 'IMG misty forest'] },
    { search: 'IMG cat - dog + watercolor', parts: ['IMG cat - dog + watercolor'] },
    { search: 'TAG favourite MMR 10', parts: ['TAG favourite', 'MMR 10'] },
    { search: 'SIMILAR abc landscape', parts: ['SIMILAR abc landscape'] },
    { search: 'fd landscape', parts: ['fd landscape'] },
];

for (const { search, parts } of splitCases) {
    assert.deepEqual(splitSearchParts(search), parts, `splitSearchParts handles ${search}`);
}

assert.equal(unescapeSearchLiterals('\\MODEL sheet'), 'MODEL sheet', 'unescapes literal keyword tokens');
assert.equal(unescapeSearchLiterals('red \\NOT girl'), 'red NOT girl', 'unescapes literal NOT tokens');

assert.deepEqual(
    parseWeightedImgQueryClauses('cat - dog + watercolor'),
    [
        { text: 'cat', weight: 1 },
        { text: 'dog', weight: -1 },
        { text: 'watercolor', weight: 1 },
    ],
    'parses weighted IMG query clauses',
);

assert.deepEqual(
    parseWeightedImgQueryClauses('id-with-dashes + sci-fi'),
    [
        { text: 'id-with-dashes', weight: 1 },
        { text: 'sci-fi', weight: 1 },
    ],
    'requires spaced separators for weighted IMG clauses',
);

const fullImageId = 'a'.repeat(64);
const implicitSimilarSearch = `landscape SIMILAR img ${fullImageId}`;
const similarClauses = tokenizeSearchClauses(implicitSimilarSearch);
assert.equal(similarClauses.length, 2, 'tokenizes implicit SIMILAR clause boundaries');
assert.match(similarClauses[1]?.text ?? '', /^SIMILAR img /i, 'keeps SIMILAR clause body after implicit split');

console.log('searching.test.ts: all tests passed');
