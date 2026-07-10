import assert from 'node:assert/strict';
import {
    IMAGE_ID_LENGTH,
    abbreviateImageId,
    applyExpandedIdDeletion,
    buildDisplaySegments,
    canonicalFromDisplay,
    collapseExpandedIds,
    findAbbreviatedIdSegmentAtCursor,
    formatSearchDisplay,
    getSimilarIdSpans,
    shouldAbbreviateImageId,
    shouldCollapseExpandedImageId,
} from '../src/lib/tools/searchDisplay.ts';

const fullId = 'a'.repeat(IMAGE_ID_LENGTH);
const abbrev = abbreviateImageId(fullId);

assert.equal(abbrev, `${'a'.repeat(6)}...`, 'abbreviates long ids to six characters plus ellipsis');

assert.equal(
    formatSearchDisplay(`SIMILAR ${fullId}`),
    `SIMILAR ${abbrev}`,
    'abbreviates prompt similar ids in display text',
);

assert.equal(
    formatSearchDisplay(`SIMILAR img ${fullId} 0.8`),
    `SIMILAR img ${abbrev} 0.8`,
    'abbreviates image similar ids while preserving img and threshold',
);

assert.equal(
    formatSearchDisplay(`NOT SM img ${fullId}`),
    `NOT SM img ${abbrev}`,
    'preserves negation and alias keywords',
);

assert.equal(
    formatSearchDisplay(`SIMILAR ${fullId} AND TAG favourite`),
    `SIMILAR ${abbrev} AND TAG favourite`,
    'preserves AND clauses outside the similar span',
);

assert.equal(
    canonicalFromDisplay(`SIMILAR ${abbrev}`, `SIMILAR ${fullId}`),
    `SIMILAR ${fullId}`,
    'maps abbreviated display ids back to canonical ids',
);

assert.equal(
    canonicalFromDisplay(`SIMILAR img ${abbrev} 0.8`, `SIMILAR img ${fullId} 0.8`),
    `SIMILAR img ${fullId} 0.8`,
    'maps abbreviated image similar ids back to canonical ids',
);

const editedPartial = fullId.slice(0, 63);
assert.equal(
    canonicalFromDisplay(`SIMILAR ${editedPartial}`, `SIMILAR ${fullId}`),
    `SIMILAR ${editedPartial}`,
    'preserves partial edits from expanded ids',
);

assert.equal(
    formatSearchDisplay(`SIMILAR ${editedPartial}`, new Set([getSimilarIdSpans(`SIMILAR ${editedPartial}`)[0].idStart])),
    `SIMILAR ${editedPartial}`,
    'keeps partial ids expanded until they reach the expected length',
);

assert.equal(
    formatSearchDisplay(`SIMILAR ${fullId}`, new Set([getSimilarIdSpans(`SIMILAR ${fullId}`)[0].idStart])),
    `SIMILAR ${fullId}`,
    'shows the full id while expanded',
);

assert.deepEqual(
    collapseExpandedIds(`SIMILAR ${fullId}`, new Set([getSimilarIdSpans(`SIMILAR ${fullId}`)[0].idStart])),
    new Set(),
    'collapses expanded ids once they reach the expected length',
);

assert.deepEqual(
    collapseExpandedIds(`SIMILAR ${editedPartial}`, new Set([getSimilarIdSpans(`SIMILAR ${editedPartial}`)[0].idStart])),
    new Set([getSimilarIdSpans(`SIMILAR ${editedPartial}`)[0].idStart]),
    'keeps partial ids expanded',
);

const promptCanonical = `SIMILAR ${fullId} 0.6`;
const promptDisplay = formatSearchDisplay(promptCanonical);
const promptSpan = getSimilarIdSpans(promptCanonical)[0];
const promptSegmentStart = buildDisplaySegments(promptCanonical)[1];
assert.equal(promptSegmentStart?.kind, 'id', 'builds an id segment for similar clauses');

const deleteResult = applyExpandedIdDeletion({
    canonical: promptCanonical,
    expandedIdStarts: new Set(),
    span: promptSpan,
    segmentStart: promptDisplay.indexOf(abbrev),
    cursor: promptDisplay.indexOf(abbrev) + abbrev.length,
    key: 'Backspace',
});
assert.equal(
    deleteResult.canonical,
    `SIMILAR ${fullId.slice(0, -1)} 0.6`,
    'expands abbreviated ids before applying backspace deletion',
);
assert.equal(
    deleteResult.display.includes(fullId.slice(0, -1)),
    true,
    'shows the edited full id after deletion until it can collapse again',
);

const backspaceMatch = findAbbreviatedIdSegmentAtCursor(
    promptCanonical,
    new Set(),
    promptDisplay.indexOf(abbrev) + abbrev.length,
    'Backspace',
);
assert.ok(backspaceMatch, 'detects abbreviated ids targeted by backspace');

const deleteMatch = findAbbreviatedIdSegmentAtCursor(
    promptCanonical,
    new Set(),
    promptDisplay.indexOf(abbrev),
    'Delete',
);
assert.ok(deleteMatch, 'detects abbreviated ids targeted by delete');

assert.equal(shouldAbbreviateImageId(fullId), true, 'treats library ids as abbreviatable');
assert.equal(shouldAbbreviateImageId('abc123'), false, 'does not abbreviate short ids');
assert.equal(shouldCollapseExpandedImageId(fullId), true, 'collapses ids at the expected library length');

console.log('searchDisplay.test.ts: all tests passed');
