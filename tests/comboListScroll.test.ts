import assert from 'node:assert/strict';
import { comboListScrollDelta } from '../src/lib/svgen/comboListScroll.ts';

{
    const delta = comboListScrollDelta(0, 200, 400, 424, 'center');
    assert.equal(delta, 312, 'centers an item below the viewport');
}

{
    const delta = comboListScrollDelta(0, 200, 80, 104, 'center');
    assert.equal(delta, -8, 'nudges a near-center item to the exact center');
}

{
    assert.equal(
        comboListScrollDelta(0, 200, 40, 64, 'nearest'),
        0,
        'nearest is a no-op when the item is already visible',
    );
    assert.equal(
        comboListScrollDelta(0, 200, -20, 4, 'nearest'),
        -20,
        'nearest pulls an item up from above the list',
    );
    assert.equal(
        comboListScrollDelta(0, 200, 190, 214, 'nearest'),
        14,
        'nearest pushes an item down from below the list',
    );
}
