import assert from 'node:assert/strict';
import { getPrompts } from '../src/lib/tools/metadataInterpreter.ts';

const a1111Prompt = 'fallback positive\nNegative prompt: fallback negative\nSteps: 20, Model: test.safetensors, Seed: 1';

const onlyPositive = getPrompts(a1111Prompt, undefined, JSON.stringify({ positive: 'extra positive' }));
assert.equal(onlyPositive?.pos, 'extra positive', 'extra positive without negative');
assert.equal(onlyPositive?.neg, 'fallback negative', 'falls back to workflow-derived negative');

const both = getPrompts(a1111Prompt, undefined, JSON.stringify({
    positive: 'extra positive',
    negative: 'extra negative',
}));
assert.equal(both?.pos, 'extra positive', 'extra positive with explicit negative');
assert.equal(both?.neg, 'extra negative', 'extra negative with explicit positive');

const promptOnly = getPrompts(a1111Prompt, undefined, JSON.stringify({ prompt: 'prompt-only positive' }));
assert.equal(promptOnly?.pos, 'prompt-only positive', 'extra prompt without separator');
assert.equal(promptOnly?.neg, 'fallback negative', 'falls back when prompt has no negative part');

console.log('metadata-prompts.test.ts: all assertions passed');
