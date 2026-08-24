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

console.log('metadata-params.test.ts: all assertions passed');
