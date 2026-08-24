import assert from 'node:assert/strict';
import { parseByteRange } from '../src/lib/server/byteRange.ts';

const size = 1000;

{
    assert.deepEqual(parseByteRange(null, size), { kind: 'none' }, 'null header');
    assert.deepEqual(parseByteRange(undefined, size), { kind: 'none' }, 'undefined header');
    assert.deepEqual(parseByteRange('', size), { kind: 'none' }, 'empty header');
    assert.deepEqual(parseByteRange('  ', size), { kind: 'none' }, 'whitespace header');
    assert.deepEqual(parseByteRange('items=0-10', size), { kind: 'none' }, 'unknown unit');
}

{
    assert.deepEqual(
        parseByteRange('bytes=0-499', size),
        { kind: 'range', start: 0, end: 499 },
        'closed range',
    );
    assert.deepEqual(
        parseByteRange('bytes=500-', size),
        { kind: 'range', start: 500, end: 999 },
        'open end',
    );
    assert.deepEqual(
        parseByteRange('bytes=0-', size),
        { kind: 'range', start: 0, end: 999 },
        'entire file via open end',
    );
    assert.deepEqual(
        parseByteRange('bytes=-200', size),
        { kind: 'range', start: 800, end: 999 },
        'suffix',
    );
    assert.deepEqual(
        parseByteRange('bytes=-2000', size),
        { kind: 'range', start: 0, end: 999 },
        'suffix longer than file',
    );
    assert.deepEqual(
        parseByteRange('bytes=0-0', size),
        { kind: 'range', start: 0, end: 0 },
        'first byte',
    );
    assert.deepEqual(
        parseByteRange('bytes=0-9999', size),
        { kind: 'range', start: 0, end: 999 },
        'end is clamped',
    );
    assert.deepEqual(
        parseByteRange(' bytes=10-19 ', size),
        { kind: 'range', start: 10, end: 19 },
        'trimmed',
    );
    assert.deepEqual(
        parseByteRange('bytes=100-199,200-299', size),
        { kind: 'range', start: 100, end: 199 },
        'first range only',
    );
}

{
    assert.deepEqual(
        parseByteRange('bytes=1000-1001', size),
        { kind: 'unsatisfiable' },
        'start at size',
    );
    assert.deepEqual(
        parseByteRange('bytes=500-20', size),
        { kind: 'unsatisfiable' },
        'start after end',
    );
    assert.deepEqual(
        parseByteRange('bytes=abc-10', size),
        { kind: 'unsatisfiable' },
        'non-integer start',
    );
    assert.deepEqual(
        parseByteRange('bytes=-0', size),
        { kind: 'unsatisfiable' },
        'zero suffix',
    );
    assert.deepEqual(
        parseByteRange('bytes=', size),
        { kind: 'unsatisfiable' },
        'empty spec',
    );
    assert.deepEqual(
        parseByteRange('bytes=0-10', 0),
        { kind: 'unsatisfiable' },
        'empty body',
    );
}

console.log('byteRange.test.ts: all tests passed');
