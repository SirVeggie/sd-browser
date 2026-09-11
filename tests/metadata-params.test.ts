import assert from 'node:assert/strict';
import { getComfyMetadataParamsText } from '../src/lib/tools/metadataInterpreter.ts';

const prompt = JSON.stringify({
    '5': {
        inputs: { sampler_name: 'euler', cfg: 7, steps: 20 },
        class_type: 'KSampler',
        _meta: { title: 'KSampler' },
    },
    '3': {
        inputs: { ckpt_name: 'model.safetensors' },
        class_type: 'CheckpointLoaderSimple',
        _meta: { title: 'Load Checkpoint' },
    },
});

const workflowOrderA = JSON.stringify({
    nodes: [
        { id: 3, type: 'CheckpointLoaderSimple', title: 'Load Checkpoint', order: 0 },
        { id: 5, type: 'KSampler', title: 'KSampler', order: 1 },
    ],
});

const workflowOrderB = JSON.stringify({
    nodes: [
        { id: 5, type: 'KSampler', title: 'KSampler', order: 0 },
        { id: 3, type: 'CheckpointLoaderSimple', title: 'Load Checkpoint', order: 1 },
    ],
});

const paramsA = getComfyMetadataParamsText(prompt, workflowOrderA);
const paramsB = getComfyMetadataParamsText(prompt, workflowOrderB);

assert.equal(paramsA, paramsB, 'params text stable regardless of workflow node order');
assert.ok(paramsA.includes('Load Checkpoint'), 'includes checkpoint section');
assert.ok(paramsA.includes('KSampler'), 'includes sampler section');
assert.ok(
    paramsA.indexOf('Load Checkpoint') < paramsA.indexOf('KSampler'),
    'sections ordered by node id, not execution order',
);

const shuffledInputsPrompt = JSON.stringify({
    '5': {
        inputs: { steps: 20, sampler_name: 'euler', cfg: 7 },
        class_type: 'KSampler',
        _meta: { title: 'KSampler' },
    },
    '3': {
        inputs: { ckpt_name: 'model.safetensors' },
        class_type: 'CheckpointLoaderSimple',
        _meta: { title: 'Load Checkpoint' },
    },
});

const paramsShuffled = getComfyMetadataParamsText(shuffledInputsPrompt, workflowOrderA);
assert.equal(paramsShuffled, paramsA, 'field order stable regardless of input key order');

const subgraphId = '2025e321-a3fb-43ba-bc36-ac6d9779fdd4';
const subgraphInnerPrompt = JSON.stringify({
    '132:128': {
        inputs: { text: 'idle animation prompt' },
        class_type: 'SV-SimpleText',
        _meta: { title: 'Prompt' },
    },
    '132:130': {
        inputs: { value: 10 },
        class_type: 'SV-Integer',
        _meta: { title: 'Seconds' },
    },
    '132:135': {
        inputs: { choice: 'Disabled' },
        class_type: 'CustomCombo',
        _meta: { title: 'Last Frame' },
    },
});
const subgraphWorkflowNoProxy = JSON.stringify({
    nodes: [{
        id: 132,
        type: subgraphId,
        title: 'Prompt Pack',
        properties: {},
        widgets_values: ['idle animation prompt', 10, 'Disabled'],
        inputs: [],
    }],
    definitions: {
        subgraphs: [{
            id: subgraphId,
            name: 'Prompt Pack',
            inputs: [
                { name: 'text', type: 'STRING', linkIds: [249], label: 'prompt' },
                { name: 'value_1', type: 'INT', linkIds: [250], label: 'seconds' },
                { name: 'choice', type: 'COMBO', linkIds: [255], label: 'last frame' },
            ],
            links: [
                { id: 249, origin_id: -10, origin_slot: 0, target_id: 128, target_slot: 0 },
                { id: 250, origin_id: -10, origin_slot: 1, target_id: 130, target_slot: 0 },
                { id: 255, origin_id: -10, origin_slot: 2, target_id: 135, target_slot: 0 },
            ],
            nodes: [
                {
                    id: 128,
                    type: 'SV-SimpleText',
                    title: 'Prompt',
                    inputs: [{ name: 'text', type: 'STRING', widget: { name: 'text' }, link: 249 }],
                    widgets_values: ['definition default'],
                    properties: {},
                },
                {
                    id: 130,
                    type: 'SV-Integer',
                    title: 'Seconds',
                    inputs: [{ name: 'value', type: 'INT', widget: { name: 'value' }, link: 250 }],
                    widgets_values: [0],
                    properties: {},
                },
                {
                    id: 135,
                    type: 'CustomCombo',
                    title: 'Last Frame',
                    inputs: [{ name: 'choice', type: 'COMBO', widget: { name: 'choice' }, link: 255 }],
                    widgets_values: ['Disabled'],
                    properties: {},
                },
            ],
        }],
    },
});

const subgraphParams = getComfyMetadataParamsText(subgraphInnerPrompt, subgraphWorkflowNoProxy);
assert.ok(subgraphParams.includes('Prompt Pack'), 'subgraph shell is the section title');
assert.ok(subgraphParams.includes('seconds: 10'), 'promoted seconds from outer widgets_values');
assert.ok(subgraphParams.includes('last frame: Disabled'), 'promoted combo from outer widgets_values');
assert.ok(!subgraphParams.includes('Seconds'), 'inner node title is not a section');
assert.ok(!subgraphParams.includes('Last Frame'), 'inner node title is not a section');

const subgraphOuterOnlyPrompt = JSON.stringify({
    '99': {
        inputs: { ckpt_name: 'other.safetensors' },
        class_type: 'CheckpointLoaderSimple',
        _meta: { title: 'Load Checkpoint' },
    },
});
const subgraphOuterOnlyWorkflow = JSON.stringify({
    nodes: [
        {
            id: 99,
            type: 'CheckpointLoaderSimple',
            title: 'Load Checkpoint',
            properties: {},
        },
        {
            id: 132,
            type: subgraphId,
            title: 'Sampler',
            properties: {},
            widgets_values: ['euler', 7, 20],
            inputs: [
                { name: 'sampler_name', type: 'COMBO', widget: { name: 'sampler_name' }, label: 'sampler' },
                { name: 'cfg', type: 'FLOAT', widget: { name: 'cfg' }, label: 'cfg' },
                { name: 'steps', type: 'INT', widget: { name: 'steps' }, label: 'steps' },
            ],
        },
    ],
    definitions: {
        subgraphs: [{
            id: subgraphId,
            name: 'Sampler',
            inputs: [
                { name: 'sampler_name', type: 'COMBO', linkIds: [1] },
                { name: 'cfg', type: 'FLOAT', linkIds: [2] },
                { name: 'steps', type: 'INT', linkIds: [3] },
            ],
            links: [
                { id: 1, origin_id: -10, origin_slot: 0, target_id: 5, target_slot: 0 },
                { id: 2, origin_id: -10, origin_slot: 1, target_id: 5, target_slot: 1 },
                { id: 3, origin_id: -10, origin_slot: 2, target_id: 5, target_slot: 2 },
            ],
            nodes: [{
                id: 5,
                type: 'KSampler',
                title: 'KSampler',
                inputs: [
                    { name: 'sampler_name', type: 'COMBO', widget: { name: 'sampler_name' }, link: 1 },
                    { name: 'cfg', type: 'FLOAT', widget: { name: 'cfg' }, link: 2 },
                    { name: 'steps', type: 'INT', widget: { name: 'steps' }, link: 3 },
                ],
                widgets_values: ['definition default', 0, 0],
                properties: {},
            }],
        }],
    },
});

const promotedFallback = getComfyMetadataParamsText(subgraphOuterOnlyPrompt, subgraphOuterOnlyWorkflow);
assert.ok(promotedFallback.includes('Sampler'), 'synthesized proxy section appears without expanded prompt');
assert.ok(promotedFallback.includes('sampler: euler'), 'outer widgets_values map onto promoted fields');
assert.ok(promotedFallback.includes('cfg: 7'), 'promoted cfg from outer widgets_values');
assert.ok(promotedFallback.includes('steps: 20'), 'promoted steps from outer widgets_values');

const collapsedWorkflow = JSON.stringify({
    nodes: [
        { id: 3, type: 'CheckpointLoaderSimple', title: 'Load Checkpoint' },
        { id: 5, type: 'KSampler', title: 'KSampler', flags: { collapsed: true } },
    ],
});
const collapsedParams = getComfyMetadataParamsText(prompt, collapsedWorkflow);
assert.ok(collapsedParams.includes('Load Checkpoint'), 'visible node still appears');
assert.ok(!collapsedParams.includes('KSampler'), 'collapsed node is omitted');

const hiddenTitleWorkflow = JSON.stringify({
    nodes: [
        { id: 3, type: 'CheckpointLoaderSimple', title: 'Load Checkpoint' },
        { id: 5, type: 'KSampler', title: '_KSampler' },
    ],
});
const hiddenTitleParams = getComfyMetadataParamsText(prompt, hiddenTitleWorkflow);
assert.ok(hiddenTitleParams.includes('Load Checkpoint'), 'visible node still appears');
assert.ok(!hiddenTitleParams.includes('KSampler'), '_-prefixed title is omitted');

const collapsedSubgraphWorkflow = JSON.parse(subgraphWorkflowNoProxy) as {
    nodes: Array<Record<string, unknown>>;
};
collapsedSubgraphWorkflow.nodes[0] = {
    ...collapsedSubgraphWorkflow.nodes[0],
    flags: { collapsed: true },
};
const collapsedSubgraphParams = getComfyMetadataParamsText(
    subgraphInnerPrompt,
    JSON.stringify(collapsedSubgraphWorkflow),
);
assert.equal(collapsedSubgraphParams, '', 'collapsed subgraph shell is omitted');

const orphanInnerPrompt = JSON.stringify({
    '3': {
        inputs: { ckpt_name: 'model.safetensors' },
        class_type: 'CheckpointLoaderSimple',
        _meta: { title: 'Load Checkpoint' },
    },
    '132:128': {
        inputs: { value: 99 },
        class_type: 'SV-Integer',
        _meta: { title: 'Hidden Inner' },
    },
});
const orphanInnerWorkflow = JSON.stringify({
    nodes: [
        { id: 3, type: 'CheckpointLoaderSimple', title: 'Load Checkpoint' },
        { id: 132, type: subgraphId, title: 'Ghost', properties: {} },
    ],
});
const orphanInnerParams = getComfyMetadataParamsText(orphanInnerPrompt, orphanInnerWorkflow);
assert.ok(orphanInnerParams.includes('Load Checkpoint'), 'top-level node still appears');
assert.ok(!orphanInnerParams.includes('Hidden Inner'), 'expanded inner prompt key is not a section');
assert.ok(!orphanInnerParams.includes('value: 99'), 'inner-only widget is omitted');

console.log('metadata-params.test.ts: all assertions passed');
