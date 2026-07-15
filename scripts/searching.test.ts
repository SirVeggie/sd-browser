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
    parseSearchTargetWithOptionalImgLimit,
} from '../src/lib/tools/searchParsing.ts';
import {
    abbreviateImageId,
    getSearchDisplay,
    inflateSearchDisplay,
    shouldCollapseExpandedSearch,
} from '../src/lib/tools/searchDisplay.ts';

assert.deepEqual(
    parseSimilarSearchTarget('abc123'),
    { imageId: 'abc123', threshold: undefined },
    'parses prompt similar id',
);

assert.deepEqual(
    parseSimilarSearchTarget('abc123 0.6'),
    { imageId: 'abc123', threshold: 0.6 },
    'parses prompt similar id with threshold',
);

assert.deepEqual(
    parseSimilarSearchTarget('SIMILAR abc123 0.8'),
    { imageId: 'abc123', threshold: 0.8 },
    'parses full prompt similar command with threshold',
);

assert.deepEqual(
    getPositiveSimilarSourceIds('SIMILAR abc AND landscape'),
    ['abc'],
    'collects positive similar source ids',
);

const fullImageId = 'a'.repeat(64);
const secondImageId = 'b'.repeat(64);

assert.deepEqual(
    getPositiveSimilarSourceIds(`NOT SIMILAR abc AND IMG ${fullImageId}`),
    [fullImageId],
    'collects positive IMG hex source ids and ignores negated similar clauses',
);

assert.deepEqual(
    getPositiveSimilarSourceIds(`IMG ${fullImageId} + ${secondImageId} - beach`),
    [fullImageId, secondImageId],
    'collects multiple positive IMG hex source ids from weighted clauses',
);

assert.deepEqual(
    parseWeightedImgQueryClauses(`${fullImageId} + turtle - ${secondImageId}`),
    [
        { kind: 'image', imageId: fullImageId, weight: 1 },
        { kind: 'text', text: 'turtle', weight: 1 },
        { kind: 'image', imageId: secondImageId, weight: -1 },
    ],
    'parses weighted IMG clauses with image ids and text',
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
    { search: 'IMG AND NOT FOLDER nsfw', parts: ['IMG', 'NOT FOLDER nsfw'] },
    { search: 'VIDEO AND FOLDER test', parts: ['VIDEO', 'FOLDER test'] },
    { search: 'NOT IMG AND FOLDER test', parts: ['NOT IMG', 'FOLDER test'] },
    { search: 'IMG AND FOLDER test', parts: ['IMG', 'FOLDER test'] },
];

for (const { search, parts } of splitCases) {
    assert.deepEqual(splitSearchParts(search), parts, `splitSearchParts handles ${search}`);
}

assert.equal(unescapeSearchLiterals('\\MODEL sheet'), 'MODEL sheet', 'unescapes literal keyword tokens');
assert.equal(unescapeSearchLiterals('red \\NOT girl'), 'red NOT girl', 'unescapes literal NOT tokens');

assert.deepEqual(
    parseWeightedImgQueryClauses('cat - dog + watercolor'),
    [
        { kind: 'text', text: 'cat', weight: 1 },
        { kind: 'text', text: 'dog', weight: -1 },
        { kind: 'text', text: 'watercolor', weight: 1 },
    ],
    'parses weighted IMG query clauses',
);

assert.deepEqual(
    parseWeightedImgQueryClauses('id-with-dashes + sci-fi'),
    [
        { kind: 'text', text: 'id-with-dashes', weight: 1 },
        { kind: 'text', text: 'sci-fi', weight: 1 },
    ],
    'requires spaced separators for weighted IMG clauses',
);

assert.deepEqual(
    parseWeightedImgQueryClauses('- girl'),
    [{ kind: 'text', text: 'girl', weight: -1 }],
    'parses leading negative-only IMG text clause',
);

assert.deepEqual(
    parseWeightedImgQueryClauses('- girl + boy'),
    [
        { kind: 'text', text: 'girl', weight: -1 },
        { kind: 'text', text: 'boy', weight: 1 },
    ],
    'parses leading negative with mid-query positive separator',
);

assert.deepEqual(
    parseWeightedImgQueryClauses('+ girl'),
    [{ kind: 'text', text: 'girl', weight: 1 }],
    'parses leading positive IMG text clause',
);

assert.deepEqual(
    parseWeightedImgQueryClauses(`- ${fullImageId}`),
    [{ kind: 'image', imageId: fullImageId, weight: -1 }],
    'parses leading negative image id clause',
);

assert.deepEqual(
    parseSearchTargetWithOptionalImgLimit('- girl 0.8'),
    { text: '- girl', threshold: 0.8, k: undefined },
    'strips threshold from leading-negative IMG query before weighted parse',
);

assert.deepEqual(
    parseWeightedImgQueryClauses(
        parseSearchTargetWithOptionalImgLimit('- girl 0.8').text,
    ),
    [{ kind: 'text', text: 'girl', weight: -1 }],
    'parses leading-negative IMG query after threshold strip',
);

assert.deepEqual(
    parseSearchTargetWithOptionalImgLimit('- girl -1'),
    { text: '- girl', threshold: undefined, k: -1 },
    'strips force-js k from leading-negative IMG query',
);

assert.deepEqual(
    parseWeightedImgQueryClauses(
        parseSearchTargetWithOptionalImgLimit('- girl -1').text,
    ),
    [{ kind: 'text', text: 'girl', weight: -1 }],
    'parses leading-negative IMG query after k strip',
);

assert.deepEqual(
    parseSearchTargetWithOptionalImgLimit('cat 0.8 100'),
    { text: 'cat', threshold: 0.8, k: 100 },
    'parses IMG query with threshold then k',
);

assert.deepEqual(
    parseSearchTargetWithOptionalImgLimit('cat 100 0.8'),
    { text: 'cat', threshold: 0.8, k: 100 },
    'parses IMG query with k then threshold',
);

assert.deepEqual(
    parseSearchTargetWithOptionalImgLimit('cat 100'),
    { text: 'cat', threshold: undefined, k: 100 },
    'parses IMG query with k only',
);

assert.deepEqual(
    parseSearchTargetWithOptionalImgLimit('cat 0.8'),
    { text: 'cat', threshold: 0.8, k: undefined },
    'parses IMG query with threshold only',
);

assert.deepEqual(
    parseSearchTargetWithOptionalImgLimit('cat -1 0.8'),
    { text: 'cat', threshold: 0.8, k: -1 },
    'parses IMG query with force-js k and threshold',
);

assert.deepEqual(
    parseSearchTargetWithOptionalImgLimit('cat 0.8 -1'),
    { text: 'cat', threshold: 0.8, k: -1 },
    'parses IMG query with threshold and force-js k in either order',
);

assert.deepEqual(
    parseSearchTargetWithOptionalImgLimit('cat -1'),
    { text: 'cat', threshold: undefined, k: -1 },
    'parses IMG query with force-js k only',
);

const implicitImgSearch = `landscape IMG ${fullImageId}`;
const imgClauses = tokenizeSearchClauses(implicitImgSearch);
assert.equal(imgClauses.length, 2, 'tokenizes implicit IMG clause boundaries');
assert.match(imgClauses[1]?.text ?? '', /^IMG /i, 'keeps IMG clause body after implicit split');

const similarDisplay = getSearchDisplay(`SIMILAR ${fullImageId} 0.8`);
assert.equal(
    similarDisplay.text,
    `SIMILAR ${abbreviateImageId(fullImageId)} 0.8`,
    'abbreviates SIMILAR prompt-mode hex ids',
);

const weightedImgDisplay = getSearchDisplay(`IMG ${fullImageId} + ${secondImageId} - beach`);
assert.equal(
    weightedImgDisplay.text,
    `IMG ${abbreviateImageId(fullImageId)} + ${abbreviateImageId(secondImageId)} - beach`,
    'abbreviates all hex ids inside IMG clauses',
);

assert.equal(
    inflateSearchDisplay(weightedImgDisplay.text, `IMG ${fullImageId} + ${secondImageId} - beach`),
    `IMG ${fullImageId} + ${secondImageId} - beach`,
    'inflates abbreviated IMG hex ids on edit',
);

assert.equal(shouldCollapseExpandedSearch(`IMG ${fullImageId}`), true, 'collapses intact IMG hex ids');
assert.equal(
    shouldCollapseExpandedSearch(`IMG ${fullImageId.slice(0, 60)}`),
    false,
    'keeps expanded display while an IMG hex id is partially edited',
);

console.log('searching.test.ts: all tests passed');
