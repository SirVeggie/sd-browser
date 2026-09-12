import assert from 'node:assert/strict';
import {
    MULTILINE_MAX_LINES,
    computeAutosizeHeight,
    shouldRemeasureForWidth,
} from '../src/lib/svgen/textareaAutosize.ts';

const box = {
    lineHeight: 16,
    fontSize: 12,
    paddingY: 6,
    borderY: 0,
};

{
    assert.equal(
        shouldRemeasureForWidth(-1, 0),
        false,
        'not laid out yet',
    );
    assert.equal(
        shouldRemeasureForWidth(400, 0),
        false,
        'collapsed flyout width is not a remasure',
    );
    assert.equal(
        shouldRemeasureForWidth(400, 400),
        false,
        'height-only resize must not remasure',
    );
    assert.equal(
        shouldRemeasureForWidth(-1, 400),
        true,
        'first real width remasures',
    );
    assert.equal(
        shouldRemeasureForWidth(400, 250),
        true,
        'column / flyout wrap-width change remasures',
    );
}

{
    assert.equal(
        computeAutosizeHeight(80, 0, box),
        null,
        'skip while clientWidth is 0',
    );
}

{
    const short = computeAutosizeHeight(40, 320, box);
    assert.ok(short);
    assert.equal(short.height, 40);
    assert.equal(short.overflowY, 'hidden');
}

{
    const lineHeight = 16;
    const maxHeight = lineHeight * MULTILINE_MAX_LINES + box.paddingY + box.borderY;
    const tall = computeAutosizeHeight(maxHeight + 80, 320, box);
    assert.ok(tall);
    assert.equal(tall.height, maxHeight);
    assert.equal(tall.overflowY, 'auto');
}

{
    const fallback = computeAutosizeHeight(30, 320, {
        lineHeight: Number.NaN,
        fontSize: 10,
        paddingY: 4,
        borderY: 2,
    });
    assert.ok(fallback);
    assert.equal(fallback.height, 30);
    assert.equal(fallback.overflowY, 'hidden');
}

{
    const maxHeight = 10 * 1.35 * MULTILINE_MAX_LINES;
    const fallbackCap = computeAutosizeHeight(1000, 320, {
        lineHeight: 0,
        fontSize: 10,
        paddingY: 0,
        borderY: 0,
    });
    assert.ok(fallbackCap);
    assert.equal(fallbackCap.height, maxHeight);
    assert.equal(fallbackCap.overflowY, 'auto');
}

console.log('textareaAutosize tests passed');
