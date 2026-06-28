import assert from 'node:assert/strict';
import {
    extractModelFilenamesFromText,
    formatModels,
    getModelCandidates,
    getModels,
    getPrimaryModel,
    MULTIPLE_MODELS,
    parseStoredModels,
    UNKNOWN_MODEL,
} from '../src/lib/tools/metadataInterpreter.ts';

const comfyCkpt = '{"3":{"inputs":{"ckpt_name":"TrueHDi_00001_.safetensors"},"class_type":"CheckpointLoaderSimple"}}';
const comfyWorkflow = JSON.stringify({
    nodes: [{ id: 3, type: 'CheckpointLoaderSimple', title: 'Load Checkpoint', order: 0 }],
});

assert.deepEqual(
    parseStoredModels(getModels(comfyCkpt, comfyWorkflow, undefined)),
    ['TrueHDi_00001_.safetensors'],
    'comfy ckpt storage',
);

assert.deepEqual(
    extractModelFilenamesFromText('{"lora": "my cool lora v2.safetensors"}').sort(),
    ['my cool lora v2.safetensors'],
    'quoted spaces',
);

assert.deepEqual(
    extractModelFilenamesFromText('Model: bare_name.safetensors, Steps: 20'),
    ['bare_name.safetensors'],
    'unquoted a1111 model filename',
);

assert.equal(
    getModels(undefined, undefined, JSON.stringify({ model: 'explicit.safetensors' })),
    '["explicit.safetensors"]',
    'extra.model storage',
);

assert.equal(
    getPrimaryModel(
        getModelCandidates(undefined, undefined, JSON.stringify({ model: 'explicit.safetensors' })),
        JSON.stringify({ model: 'explicit.safetensors' }),
    ),
    'explicit.safetensors',
    'extra.model primary',
);

assert.equal(
    getPrimaryModel(
        getModelCandidates(undefined, undefined, JSON.stringify({ params: 'model: params-model.safetensors' })),
        JSON.stringify({ params: 'model: params-model.safetensors' }),
    ),
    'params-model.safetensors',
    'extra.params model primary',
);

const swarmPrompt = JSON.stringify({
    sui_image_params: { model: 'swarm-model.gguf', prompt: 'test' },
});
assert.deepEqual(
    parseStoredModels(getModels(swarmPrompt, undefined, undefined)),
    ['swarm-model.gguf'],
    'swarm model storage',
);

const a1111Prompt = 'masterpiece\nNegative prompt: bad\nSteps: 20, Model: a1111-model.safetensors, Seed: 1';
assert.deepEqual(
    parseStoredModels(getModels(a1111Prompt, undefined, undefined)),
    ['a1111-model.safetensors'],
    'a1111 model storage',
);

const multiPrompt = `{"a":{"inputs":{"ckpt_name":"main.safetensors"},"class_type":"CheckpointLoaderSimple","_meta":{"title":"Main Checkpoint"}},"b":{"inputs":{"vae_name":"vae.safetensors"},"class_type":"VAELoader","_meta":{"title":"VAE"}}}`;
const multiWorkflow = JSON.stringify({
    nodes: [
        { id: 'a', type: 'CheckpointLoaderSimple', title: 'Main Checkpoint', order: 0 },
        { id: 'b', type: 'VAELoader', title: 'VAE', order: 1 },
    ],
});
const multiCandidates = getModelCandidates(multiPrompt, multiWorkflow, undefined);
assert.equal(getPrimaryModel(multiCandidates, undefined), 'main.safetensors', 'primary excludes vae');
assert.ok(formatModels(multiCandidates).includes('main.safetensors'), 'format models details');

const onlyPt = getModelCandidates('{"x":"embed.pt"}', undefined, undefined);
assert.equal(getPrimaryModel(onlyPt, undefined), 'embed.pt', 'single pt model primary');

const ptAndCkpt = getModelCandidates(
    '{"a":{"inputs":{"ckpt_name":"main.safetensors"},"class_type":"CheckpointLoaderSimple"},"b":{"inputs":{"clip_name":"clip.pt"},"class_type":"CLIPLoader","_meta":{"title":"CLIP"}}}',
    JSON.stringify({
        nodes: [
            { id: 'a', type: 'CheckpointLoaderSimple', title: 'Checkpoint', order: 0 },
            { id: 'b', type: 'CLIPLoader', title: 'CLIP', order: 1 },
        ],
    }),
    undefined,
);
assert.equal(getPrimaryModel(ptAndCkpt, undefined), 'main.safetensors', 'primary omits pt and clip');

const ambiguous = getModelCandidates(
    '{"a":{"inputs":{"ckpt_name":"one.safetensors"},"class_type":"CheckpointLoaderSimple"},"b":{"inputs":{"ckpt_name":"two.safetensors"},"class_type":"CheckpointLoaderSimple"}}',
    JSON.stringify({
        nodes: [
            { id: 'a', type: 'CheckpointLoaderSimple', title: 'Checkpoint A', order: 0 },
            { id: 'b', type: 'CheckpointLoaderSimple', title: 'Checkpoint B', order: 1 },
        ],
    }),
    undefined,
);
assert.equal(getPrimaryModel(ambiguous, undefined), MULTIPLE_MODELS, 'ambiguous primary');

assert.equal(getPrimaryModel([], undefined), UNKNOWN_MODEL, 'unknown primary');

console.log('model parser tests passed');
