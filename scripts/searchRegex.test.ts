import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
    compileSearchRegex,
    UnsupportedSearchRegexError,
} from '../src/lib/server/searchRegex.ts';

const pattern = 'conditioning(.*\\n)*enable: true';
const compiled = compileSearchRegex(pattern, 'is');

assert.equal(compiled.engine, 're2', 'uses RE2 for ordinary search patterns');

const matching = `conditioning\n${'line\n'.repeat(40)}enable: true`;
assert.equal(compiled.test(matching), true, 'matches across newlines');

// Same shape that makes JS RegExp hang for seconds (nested quantifier + near-miss).
const nearMiss = `conditioning${'\n'.repeat(40)}enable: tru`;
const t0 = performance.now();
const missed = compiled.test(nearMiss);
const ms = performance.now() - t0;

assert.equal(missed, false, 'near-miss does not match');
assert.ok(
    ms < 50,
    `ReDoS-prone pattern must stay fast under RE2 (took ${ms.toFixed(1)}ms)`,
);

assert.equal(
    compileSearchRegex(String.raw`conditioning([^\n]*\n)*enable: true`, 'is').test(matching),
    true,
    'intended [\\\\n] class matches',
);

// Empty [^] is valid JS (≈ any char) and ReDoS-prone; RE2 rejects — must not JS-fallback.
assert.throws(
    () => compileSearchRegex(String.raw`conditioning([^]*\n)*enable: true`, 'is'),
    (err: unknown) => err instanceof UnsupportedSearchRegexError,
    'empty negated class must not fall back to JS RegExp',
);

assert.throws(
    () => compileSearchRegex('(?=x)x', 'i'),
    (err: unknown) => err instanceof UnsupportedSearchRegexError,
    'lookahead is unsupported',
);

console.log('searchRegex.test.ts: all tests passed');
