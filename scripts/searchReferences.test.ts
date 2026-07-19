import assert from 'node:assert/strict';
import {
    addImageRefs,
    clearImageRefs,
    getNextAvailableSlot,
    imageRefs,
    MAX_IMAGE_SEARCH_REFS,
    normalizeImageSearchRefs,
    removeImageRef,
} from '../src/lib/stores/imageRefStore.ts';
import { get } from 'svelte/store';
import {
    expandSearchReferences,
    getSearchReferenceRanges,
    hasInvalidSearchReferences,
    INVALID_REF_SEARCH,
} from '../src/lib/tools/searchReferences.ts';

const id1 = 'a'.repeat(64);
const id2 = 'b'.repeat(64);
const id3 = 'c'.repeat(64);

function resetRefs() {
    clearImageRefs();
}

resetRefs();

assert.equal(getNextAvailableSlot([]), 1, 'empty refs start at slot 1');
assert.equal(getNextAvailableSlot([{ slot: 1, id: id1 }]), 2, 'fills slot 2 when 1 is used');
assert.equal(getNextAvailableSlot([{ slot: 1, id: id1 }, { slot: 3, id: id3 }]), 2, 'reuses lowest gap');

const numbering = addImageRefs([id1, id2, id3]);
assert.deepEqual(
    numbering.added.map((ref) => ref.slot),
    [1, 2, 3],
    'adds three refs to slots 1,2,3',
);

removeImageRef(2);
assert.deepEqual(
    get(imageRefs).map((ref) => ref.slot),
    [1, 3],
    'removing slot 2 leaves 1 and 3',
);

const refill = addImageRefs([id2]);
assert.equal(refill.added[0]?.slot, 2, 'next add fills lowest available slot');

resetRefs();

const capIds = Array.from({ length: MAX_IMAGE_SEARCH_REFS + 2 }, (_, index) =>
    `${index.toString(16).padStart(64, '0')}`,
);
const capResult = addImageRefs(capIds);
assert.equal(capResult.added.length, MAX_IMAGE_SEARCH_REFS, 'caps at 20 refs');
assert.equal(capResult.skippedCap.length, 2, 'reports ids skipped by cap');
assert.equal(get(imageRefs).length, MAX_IMAGE_SEARCH_REFS, 'store holds 20 refs');

resetRefs();
addImageRefs([id1]);
const duplicate = addImageRefs([id1, id2]);
assert.deepEqual(duplicate.skippedDuplicates, [id1], 'skips duplicate ids');
assert.equal(duplicate.added.length, 1, 'adds only new id');
assert.equal(duplicate.added[0]?.id, id2, 'adds the non-duplicate id');

resetRefs();
addImageRefs([id1, id2]);

const refMap = new Map([[1, id1], [2, id2]]);

assert.equal(
    expandSearchReferences(`IMG [1] 0.8`, refMap),
    `IMG ${id1} 0.8`,
    'expands bracket ref in IMG clause',
);

assert.equal(
    expandSearchReferences(`IMG #1 0.8`, refMap),
    `IMG ${id1} 0.8`,
    'expands hash ref in IMG clause',
);

assert.equal(
    expandSearchReferences(`IMG avg #1 #2`, refMap),
    `IMG avg ${id1} ${id2}`,
    'expands multiple hash refs in mode form',
);

assert.equal(
    expandSearchReferences(`IMG [1] + cat - #2`, refMap),
    `IMG ${id1} + cat - ${id2}`,
    'expands refs in weighted IMG query',
);

assert.equal(
    expandSearchReferences(`IMG more #1 #2`, refMap),
    `IMG more ${id1} ${id2}`,
    'expands refs in more mode',
);

assert.equal(
    expandSearchReferences(`IMG avg [refs] 0.8`, refMap),
    `IMG avg ${id1} ${id2} 0.8`,
    'expands [refs] to all ids in slot order',
);

assert.equal(
    expandSearchReferences(`IMG [REFS]`, refMap),
    `IMG ${id1} ${id2}`,
    '[refs] match is case-insensitive',
);

const sparseMap = new Map([[3, id3], [1, id1]]);
assert.equal(
    expandSearchReferences('IMG avg [refs]', sparseMap),
    `IMG avg ${id1} ${id3}`,
    '[refs] sorts by slot even when map insertion order differs',
);

const untouched = `IMG ${id1} 0.8`;
assert.equal(
    expandSearchReferences(untouched, refMap),
    untouched,
    'does not alter full hex ids',
);

assert.equal(hasInvalidSearchReferences('IMG #1', refMap), false, 'valid ref is not invalid');
assert.equal(hasInvalidSearchReferences('IMG #3', refMap), true, 'missing slot is invalid');
assert.equal(hasInvalidSearchReferences('IMG [99]', refMap), true, 'missing bracket ref is invalid');
assert.equal(hasInvalidSearchReferences(`IMG ${id1}`, refMap), false, 'hex id alone is not a ref token');
assert.equal(hasInvalidSearchReferences('IMG [refs]', refMap), false, '[refs] with refs present is valid');
assert.equal(hasInvalidSearchReferences('IMG [refs]', new Map()), true, '[refs] with no refs is invalid');

const ranges = getSearchReferenceRanges('IMG #1 + cat - [2] AND #9', refMap);
assert.deepEqual(
    ranges,
    [
        { start: 4, end: 6, slot: 1, valid: true },
        { start: 15, end: 18, slot: 2, valid: true },
        { start: 23, end: 25, slot: 9, valid: false },
    ],
    'collects valid and invalid ref ranges',
);

assert.deepEqual(
    getSearchReferenceRanges('IMG avg [refs]', refMap),
    [{ start: 8, end: 14, slot: null, valid: true }],
    'collects [refs] highlight range when refs exist',
);

assert.deepEqual(
    getSearchReferenceRanges('SM [refs]', new Map()),
    [{ start: 3, end: 9, slot: null, valid: false }],
    'marks empty [refs] as invalid for highlighting',
);

const typedSearch = 'IMG #1 0.8';
expandSearchReferences(typedSearch, refMap);
assert.equal(typedSearch, 'IMG #1 0.8', 'expand does not mutate the input string');

assert.deepEqual(
    normalizeImageSearchRefs([
        { slot: 2, id: id2 },
        { slot: 1, id: id1 },
        { slot: 1, id: id3 },
        { slot: 0, id: id1 },
        { slot: 21, id: id1 },
        { slot: 5, id: 'not-hex' },
    ]),
    [{ slot: 1, id: id1 }, { slot: 2, id: id2 }],
    'normalizes, dedupes, sorts, and validates refs on load',
);

resetRefs();
addImageRefs([id1]);

const validQuery = hasInvalidSearchReferences('IMG #1', refMap)
    ? INVALID_REF_SEARCH
    : expandSearchReferences('IMG #1', refMap);
assert.equal(validQuery, `IMG ${id1}`, 'valid refs expand before search');

const invalidQuery = hasInvalidSearchReferences('IMG #9', refMap)
    ? INVALID_REF_SEARCH
    : expandSearchReferences('IMG #9', refMap);
assert.equal(invalidQuery, INVALID_REF_SEARCH, 'invalid refs use impossible ID search');

resetRefs();

console.log('searchReferences.test.ts: all tests passed');
