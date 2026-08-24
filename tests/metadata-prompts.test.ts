import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getComfyPrompts, getPrompts } from '../src/lib/tools/metadataInterpreter.ts';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

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

const combinedPrompt = [
    '$style1, $rs, (isekai fantasy, wlop), $yue,',
    'sitting on grass',
    '---',
    '$simple, sagging breasts, claws, nipples, parasol,',
].join('\n');

const untitledPromptPlusModel = {
    '1': {
        inputs: { model: 'merge\\fantasy-mix.safetensors', prompt: combinedPrompt },
        class_type: 'SV-PromptPlusModel',
    },
    '10': {
        inputs: {
            positive: ['14', 2],
            negative: ['19', 0],
            model: ['14', 0],
            clip: ['14', 1],
        },
        class_type: 'PromptControlSimple',
    },
};

const untitledWorkflow = {
    last_node_id: 10,
    last_link_id: 1,
    nodes: [
        {
            id: 1,
            type: 'SV-PromptPlusModel',
            properties: { 'Node name for S&R': 'SV-PromptPlusModel' },
            widgets_values: ['merge\\fantasy-mix.safetensors', combinedPrompt],
        },
        {
            id: 10,
            type: 'PromptControlSimple',
            properties: {},
            widgets_values: ['', '', '', 0, 1],
        },
    ],
    links: [],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
};

const fromClassType = getComfyPrompts(untitledPromptPlusModel, untitledWorkflow);
assert.ok(fromClassType?.pos.includes('$style1'), 'class_type fallback finds SV-PromptPlusModel positive');
assert.ok(fromClassType?.neg.includes('$simple'), '--- split still yields negative when class_type fallback is used');

const titledWinsPrompt = {
    ...untitledPromptPlusModel,
    '2': {
        inputs: { text: 'titled positive only' },
        class_type: 'CLIPTextEncode',
        _meta: { title: 'Positive' },
    },
};
const titledWinsWorkflow = structuredClone(untitledWorkflow);
titledWinsWorkflow.nodes.push({
    id: 2,
    type: 'CLIPTextEncode',
    title: 'Positive',
    properties: {},
    widgets_values: ['titled positive only'],
});
const titledWins = getComfyPrompts(titledWinsPrompt, titledWinsWorkflow);
assert.equal(titledWins?.pos, 'titled positive only', 'persisted title match wins over class_type fallback');
assert.equal(titledWins?.neg, '', 'no negative when titled positive wins and has no --- split');

// Title match with no extractable text must not block class_type fallback
// (real-world: Seed node titled "Prompt Seed").
const promptSeedBlocks = {
    '16': {
        inputs: { seed: 1 },
        class_type: 'Seed (rgthree)',
    },
    '131': {
        inputs: {
            model: 'comfy\\real-bun-0.8_00001_.safetensors',
            prompt: combinedPrompt,
        },
        class_type: 'SV-PromptPlusModel',
    },
};
const promptSeedWorkflow = {
    last_node_id: 131,
    last_link_id: 1,
    nodes: [
        {
            id: 16,
            type: 'Seed (rgthree)',
            title: 'Prompt Seed',
            properties: {},
            widgets_values: [1, null, null, null],
        },
        {
            id: 131,
            type: 'SV-PromptPlusModel',
            properties: {},
            widgets_values: ['comfy\\real-bun-0.8_00001_.safetensors', combinedPrompt],
        },
    ],
    links: [],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
};
const promptSeedResult = getComfyPrompts(promptSeedBlocks, promptSeedWorkflow);
assert.ok(promptSeedResult?.pos.includes('$style1'), 'Prompt Seed title without text falls back to class_type');
assert.ok(promptSeedResult?.neg.includes('$simple'), 'Prompt Seed case still splits --- negative');

const fixturePrompt = readFileSync(join(fixturesDir, 'test_prompt2.json'), 'utf8');
const fixtureWorkflow = readFileSync(join(fixturesDir, 'test_workflow2.json'), 'utf8');
const fixtureResult = getComfyPrompts(fixturePrompt, fixtureWorkflow);
assert.ok(fixtureResult?.pos.includes('holo spice and wolf'), 'fixture test_prompt2 positive from SV-PromptPlusModel');
assert.ok(fixtureResult?.neg.includes('$simple'), 'fixture test_prompt2 negative from --- split');
assert.ok(fixtureResult?.pos.includes('(dppp:1.5)'), 'fixture keeps raw prompt variables');

console.log('metadata-prompts.test.ts: all assertions passed');
