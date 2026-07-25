import assert from 'node:assert/strict';
import { getDuration } from '../src/lib/tools/metadataInterpreter.ts';

assert.equal(getDuration(undefined), undefined, 'missing extra');
assert.equal(getDuration(''), undefined, 'empty extra');
assert.equal(getDuration('not-json'), undefined, 'invalid json');
assert.equal(getDuration(JSON.stringify({ seed: 1 })), undefined, 'no duration key');
assert.equal(getDuration(JSON.stringify({ duration: '15.4' })), undefined, 'string duration ignored');
assert.equal(getDuration(JSON.stringify({ duration: Number.NaN })), undefined, 'NaN ignored');
assert.equal(getDuration(JSON.stringify({ duration: Infinity })), undefined, 'Infinity ignored');
assert.equal(getDuration(JSON.stringify({ duration: 15.4 })), 15.4, 'finite duration');
assert.equal(getDuration(JSON.stringify({ duration: 0 })), 0, 'zero duration');
assert.equal(getDuration(JSON.stringify({ duration: 15.44 }))!.toFixed(1), '15.4', 'rounds to one decimal for display');

console.log('metadata-duration tests passed');
