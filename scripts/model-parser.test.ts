import assert from 'node:assert/strict';
import {
    formatModels,
    getModelCandidates,
    getModelSearchText,
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

const multiPrompt = `{"1":{"inputs":{"ckpt_name":"main.safetensors"},"class_type":"CheckpointLoaderSimple","_meta":{"title":"Main Checkpoint"}},"2":{"inputs":{"vae_name":"vae.safetensors"},"class_type":"VAELoader","_meta":{"title":"VAE"}}}`;
const multiWorkflow = JSON.stringify({
    nodes: [
        { id: 1, type: 'CheckpointLoaderSimple', title: 'Main Checkpoint', order: 0 },
        { id: 2, type: 'VAELoader', title: 'VAE', order: 1 },
    ],
});
const multiCandidates = getModelCandidates(multiPrompt, multiWorkflow, undefined);
assert.equal(getPrimaryModel(multiCandidates, undefined), 'main.safetensors', 'primary excludes vae');
assert.ok(formatModels(multiCandidates).includes('main.safetensors'), 'format models details');

const extensionOnlyPrompt = JSON.stringify({
    '7': {
        inputs: { my_custom_file: 'weird/path/custom_lora.safetensors' },
        class_type: 'CustomLoader',
        _meta: { title: 'Custom Loader' },
    },
});
const extensionOnlyWorkflow = JSON.stringify({
    nodes: [{ id: 7, type: 'CustomLoader', title: 'Custom Loader', order: 0 }],
});
const extensionOnly = getModelCandidates(extensionOnlyPrompt, extensionOnlyWorkflow, undefined);
assert.ok(
    extensionOnly.some(candidate => candidate.model === 'weird/path/custom_lora.safetensors'),
    'extension-only widget name discovered',
);

const onlyPt = getModelCandidates(undefined, undefined, JSON.stringify({ model: 'embed.pt' }));
assert.equal(getPrimaryModel(onlyPt, undefined), 'embed.pt', 'single pt model primary');

const ptAndCkpt = getModelCandidates(
    '{"1":{"inputs":{"ckpt_name":"main.safetensors"},"class_type":"CheckpointLoaderSimple"},"2":{"inputs":{"clip_name":"clip.pt"},"class_type":"CLIPLoader","_meta":{"title":"CLIP"}}}',
    JSON.stringify({
        nodes: [
            { id: 1, type: 'CheckpointLoaderSimple', title: 'Checkpoint', order: 0 },
            { id: 2, type: 'CLIPLoader', title: 'CLIP', order: 1 },
        ],
    }),
    undefined,
);
assert.equal(getPrimaryModel(ptAndCkpt, undefined), 'main.safetensors', 'primary omits pt and clip');

const ambiguous = getModelCandidates(
    '{"1":{"inputs":{"ckpt_name":"one.safetensors"},"class_type":"CheckpointLoaderSimple"},"2":{"inputs":{"ckpt_name":"two.safetensors"},"class_type":"CheckpointLoaderSimple"}}',
    JSON.stringify({
        nodes: [
            { id: 1, type: 'CheckpointLoaderSimple', title: 'Checkpoint A', order: 0 },
            { id: 2, type: 'CheckpointLoaderSimple', title: 'Checkpoint B', order: 1 },
        ],
    }),
    undefined,
);
assert.equal(getPrimaryModel(ambiguous, undefined), MULTIPLE_MODELS, 'ambiguous primary');

assert.equal(getPrimaryModel([], undefined), UNKNOWN_MODEL, 'unknown primary');

const subgraphLoraTypeA = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const subgraphLoraTypeB = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const subgraphLoraPrompt = JSON.stringify({
    '1': {
        inputs: { ckpt_name: 'base.safetensors' },
        class_type: 'CheckpointLoaderSimple',
    },
    '548:549': {
        inputs: { lora_name: 'krea\\KNP_V2.safetensors' },
        class_type: 'LoraLoaderModelOnly',
        _meta: { title: 'Load LoRA' },
    },
    '554:553': {
        inputs: { lora_name: 'krea\\dotmatrix.safetensors' },
        class_type: 'LoraLoaderModelOnly',
        _meta: { title: 'Load LoRA' },
    },
});
const subgraphLoraWorkflow = JSON.stringify({
    nodes: [
        {
            id: 1,
            type: 'CheckpointLoaderSimple',
            title: 'Load Checkpoint',
            order: 0,
        },
        {
            id: 548,
            type: subgraphLoraTypeA,
            title: 'Load LoRA',
            order: 1,
            properties: { proxyWidgets: [[549, 'lora_name']] },
        },
        {
            id: 554,
            type: subgraphLoraTypeB,
            title: 'Load LoRA',
            order: 2,
            properties: { proxyWidgets: [[553, 'lora_name']] },
        },
    ],
    links: [],
    groups: [],
    config: {},
    version: 1,
    definitions: {
        subgraphs: [
            {
                id: subgraphLoraTypeA,
                name: 'Load LoRA',
                nodes: [{
                    id: 549,
                    type: 'LoraLoaderModelOnly',
                    title: 'Load LoRA',
                    widgets_values: ['krea\\KNP_V2.safetensors'],
                }],
            },
            {
                id: subgraphLoraTypeB,
                name: 'Load LoRA',
                nodes: [{
                    id: 553,
                    type: 'LoraLoaderModelOnly',
                    title: 'Load LoRA',
                    widgets_values: ['krea\\dotmatrix.safetensors'],
                }],
            },
        ],
    },
});
const subgraphLoraFormatted = formatModels(
    getModelCandidates(subgraphLoraPrompt, subgraphLoraWorkflow, undefined),
);
const subgraphLoraLines = subgraphLoraFormatted.split('\n').filter(Boolean);
assert.equal(subgraphLoraLines.length, 3, 'subgraph lora line count');
const subgraphLoraLabeled = subgraphLoraLines.filter(line => /^Load LoRA: /.test(line));
assert.equal(subgraphLoraLabeled.length, 2, 'subgraph lora labeled entry count');
assert.ok(
    !subgraphLoraLines.some(line => /^krea[\\]/.test(line)),
    'subgraph lora no bare duplicate paths',
);

const hfCatalogPrompt = JSON.stringify({
    '530': {
        inputs: { vae_name: 'qwen_image_vae.safetensors' },
        class_type: 'VAELoader',
        _meta: { title: 'Load VAE' },
    },
    '531': {
        inputs: { unet_name: 'krea2_turbo_fp8_scaled.safetensors', weight_dtype: 'default' },
        class_type: 'UNETLoader',
        _meta: { title: 'Load Diffusion Model' },
    },
    '532': {
        inputs: { clip_name: 'qwen3VLInstruct4bHeretic_v10.safetensors', type: 'krea2', device: 'default' },
        class_type: 'CLIPLoader',
        _meta: { title: 'Load CLIP' },
    },
    '536:59': {
        inputs: { lora_name: 'krea\\Krea-2-Turbo-Projector-Scale-LoRA-Diffusers.safetensors' },
        class_type: 'LoraLoaderModelOnly',
        _meta: { title: 'Load LoRA' },
    },
});
const hfCatalogWorkflow = JSON.stringify({
    nodes: [
        {
            id: 530,
            type: 'VAELoader',
            order: 0,
            properties: {
                models: [{
                    name: 'qwen_image_vae.safetensors',
                    url: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors',
                    directory: 'vae',
                }],
            },
            widgets_values: ['qwen_image_vae.safetensors'],
        },
        {
            id: 531,
            type: 'UNETLoader',
            order: 1,
            properties: {
                models: [{
                    name: 'krea2_turbo_fp8_scaled.safetensors',
                    url: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/diffusion_models/krea2_turbo_fp8_scaled.safetensors',
                    directory: 'diffusion_models',
                }],
            },
            widgets_values: ['krea2_turbo_fp8_scaled.safetensors', 'default'],
        },
        {
            id: 532,
            type: 'CLIPLoader',
            order: 2,
            properties: {
                models: [{
                    name: 'qwen3vl_4b_fp8_scaled.safetensors',
                    url: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors',
                    directory: 'text_encoders',
                }],
            },
            widgets_values: ['qwen3VLInstruct4bHeretic_v10.safetensors', 'krea2', 'default'],
        },
        {
            id: 536,
            type: '476fac4c-9e6e-40fa-a8cd-072a86a9cdf8',
            order: 3,
            properties: { proxyWidgets: [['59', 'lora_name']] },
            widgets_values: [],
        },
    ],
    definitions: {
        subgraphs: [{
            id: '476fac4c-9e6e-40fa-a8cd-072a86a9cdf8',
            name: 'LORA',
            nodes: [{
                id: 59,
                type: 'LoraLoaderModelOnly',
                title: 'Load LoRA',
                properties: {
                    models: [{
                        name: 'krea2_warmpastel.safetensors',
                        url: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_warmpastel.safetensors',
                        directory: 'loras',
                    }],
                },
                widgets_values: ['krea\\Krea-2-Turbo-Projector-Scale-LoRA-Diffusers.safetensors', 0.5],
            }],
        }],
    },
});
const hfCatalogCandidates = getModelCandidates(hfCatalogPrompt, hfCatalogWorkflow, undefined);
const hfCatalogModels = hfCatalogCandidates.map(candidate => candidate.model);
assert.ok(
    !hfCatalogModels.includes('qwen3vl_4b_fp8_scaled.safetensors'),
    'hf catalog clip model excluded',
);
assert.ok(
    !hfCatalogModels.includes('krea2_warmpastel.safetensors'),
    'hf catalog lora model excluded',
);
assert.ok(
    hfCatalogModels.includes('qwen3VLInstruct4bHeretic_v10.safetensors'),
    'hf actual clip model included',
);
assert.deepEqual(
    parseStoredModels(getModels(hfCatalogPrompt, hfCatalogWorkflow, undefined)).sort(),
    [...new Set(hfCatalogModels)].sort(),
    'getModels matches structured comfy candidates',
);

assert.equal(
    getModelSearchText('["one.safetensors"]'),
    'one.safetensors',
    'model search text single model',
);

assert.equal(
    getModelSearchText('["loras\\\\foo.safetensors","bar.safetensors"]'),
    'loras/foo.safetensors\nbar.safetensors',
    'model search text joins models with newlines',
);

assert.ok(
    /\n/.test(getModelSearchText('["a.safetensors","b.safetensors"]')),
    'model search text newline marks multiple models',
);

console.log('model parser tests passed');
