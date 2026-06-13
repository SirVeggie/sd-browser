import assert from 'node:assert/strict';
import { extractModels } from './extract-models.mjs';

const cases = [
    {
        name: 'comfy ckpt',
        input: '{"3": {"inputs": {"ckpt_name": "TrueHDi_00001_.safetensors"}}}',
        expected: ['TrueHDi_00001_.safetensors'],
    },
    {
        name: 'spaces in name',
        input: '{"lora": "my cool lora v2.safetensors"}',
        expected: ['my cool lora v2.safetensors'],
    },
    {
        name: 'gguf',
        input: '{"x": "some model name.gguf"}',
        expected: ['some model name.gguf'],
    },
    {
        name: 'path with spaces',
        input: '{"x": "loras/sub folder/foo bar.safetensors"}',
        expected: ['loras/sub folder/foo bar.safetensors'],
    },
    {
        name: 'escaped backslash',
        input: '{"x": "models\\\\checkpoints\\\\foo.safetensors"}',
        expected: ['models\\checkpoints\\foo.safetensors'],
    },
    {
        name: 'case insensitive extension',
        input: '{"x": "Model.SAFETENSORS"}',
        expected: ['Model.SAFETENSORS'],
    },
    {
        name: 'unquoted should skip',
        input: 'Model: bare_name.safetensors, Steps: 20',
        expected: [],
    },
    {
        name: 'prompt text mention without quotes',
        input: 'positive: use file.safetensors here without quotes',
        expected: [],
    },
    {
        name: 'multiple models',
        input: '{"a": "one.safetensors", "b": "two.gguf"}',
        expected: ['one.safetensors', 'two.gguf'],
    },
    {
        name: 'extension not at end of quoted string',
        input: '{"x": "notquite.safetensors.backup"}',
        expected: [],
    },
];

for (const { name, input, expected } of cases) {
    const result = extractModels(input);
    assert.deepEqual(result.sort(), expected.sort(), name);
    console.log(`ok - ${name}`);
}

console.log(`\n${cases.length} cases passed`);
