import assert from 'node:assert/strict';
import { getComfySeed } from '../src/lib/tools/metadataInterpreter.ts';

const REAL_SEED = 9021625420535169000;
const STALE_SAMPLER_A = 746027359421775;
const STALE_SAMPLER_B = 199706986722916;
const STALE_IMAGE = 484577728713663;

const ksamplerType = '4b5aaeb2-fb06-4f3f-b861-b5acdcf4cf0b';
const imageType = '2e60f957-2645-4fa4-b8cb-9d507de65289';

const prompt = JSON.stringify({
    '753': {
        inputs: { value: REAL_SEED },
        class_type: 'PrimitiveInt',
        _meta: { title: 'Seed' },
    },
    '752:671': {
        inputs: {
            add_noise: 'disable',
            noise_seed: ['752:674', 0],
            steps: 12,
            cfg: 1.2,
            sampler_name: 'euler_ancestral',
            scheduler: 'simple',
            start_at_step: 15,
            end_at_step: 100,
            return_with_leftover_noise: 'disable',
        },
        class_type: 'KSamplerAdvanced',
        _meta: { title: 'KSampler (Advanced)' },
    },
    '752:670': {
        inputs: {
            add_noise: 'enable',
            noise_seed: ['752:674', 0],
            steps: 12,
            cfg: 1.0,
            sampler_name: 'euler_ancestral',
            scheduler: 'simple',
            start_at_step: 2,
            end_at_step: 15,
            return_with_leftover_noise: 'enable',
        },
        class_type: 'KSamplerAdvanced',
        _meta: { title: 'KSampler (Advanced)' },
    },
    '864:863': {
        inputs: {
            image_id: 'abc',
            search: '',
            random: false,
            base_url: '',
            quality: 'medium',
            seed: ['753', 0],
        },
        class_type: 'SV-SdBrowserImage',
        _meta: { title: 'Image 1' },
    },
});

const workflow = JSON.stringify({
    nodes: [
        {
            id: 753,
            type: 'PrimitiveInt',
            title: 'Seed',
            inputs: [],
            widgets_values: [REAL_SEED, 'randomize'],
            properties: {},
        },
        {
            id: 752,
            type: ksamplerType,
            inputs: [{ name: 'value', type: '*', link: 1 }],
            widgets_values: [],
            properties: { proxyWidgets: [['670', 'steps']] },
        },
        {
            id: 864,
            type: imageType,
            inputs: [{ name: 'seed', type: 'INT', link: 2, widget: { name: 'seed' } }],
            widgets_values: [],
            properties: { proxyWidgets: [['863', 'seed']] },
        },
    ],
    links: [],
    definitions: {
        subgraphs: [
            {
                id: ksamplerType,
                name: 'KSampler',
                nodes: [
                    {
                        id: 671,
                        type: 'KSamplerAdvanced',
                        inputs: [
                            { name: 'noise_seed', type: 'INT', widget: { name: 'noise_seed' }, link: 10 },
                            { name: 'steps', type: 'INT', widget: { name: 'steps' }, link: 11 },
                            { name: 'cfg', type: 'FLOAT', widget: { name: 'cfg' }, link: 12 },
                            { name: 'sampler_name', type: 'COMBO', widget: { name: 'sampler_name' }, link: 13 },
                            { name: 'scheduler', type: 'COMBO', widget: { name: 'scheduler' }, link: 14 },
                            { name: 'start_at_step', type: 'INT', widget: { name: 'start_at_step' }, link: 15 },
                        ],
                        widgets_values: ['disable', STALE_SAMPLER_A, 'randomize', 12, 1.2, 'euler_ancestral', 'simple', 15, 100, 'disable'],
                        properties: {},
                    },
                    {
                        id: 670,
                        type: 'KSamplerAdvanced',
                        inputs: [
                            { name: 'noise_seed', type: 'INT', widget: { name: 'noise_seed' }, link: 20 },
                            { name: 'steps', type: 'INT', widget: { name: 'steps' }, link: 21 },
                            { name: 'cfg', type: 'FLOAT', widget: { name: 'cfg' }, link: 22 },
                            { name: 'sampler_name', type: 'COMBO', widget: { name: 'sampler_name' }, link: 23 },
                            { name: 'scheduler', type: 'COMBO', widget: { name: 'scheduler' }, link: 24 },
                            { name: 'start_at_step', type: 'INT', widget: { name: 'start_at_step' }, link: null },
                            { name: 'end_at_step', type: 'INT', widget: { name: 'end_at_step' }, link: 25 },
                        ],
                        widgets_values: ['enable', STALE_SAMPLER_B, 'randomize', 12, 1, 'euler_ancestral', 'simple', 2, 15, 'enable'],
                        properties: {},
                    },
                ],
            },
            {
                id: imageType,
                name: 'Image 1',
                nodes: [
                    {
                        id: 863,
                        type: 'SV-SdBrowserImage',
                        title: 'Image 1',
                        inputs: [
                            { name: 'base_url', type: 'STRING', widget: { name: 'base_url' }, link: null },
                            { name: 'quality', type: 'COMBO', widget: { name: 'quality' }, link: null },
                            { name: 'seed', type: 'INT', widget: { name: 'seed' }, link: 30 },
                        ],
                        widgets_values: ['abc', '', false, '', 'medium', STALE_IMAGE, 'randomize'],
                        properties: {},
                    },
                ],
            },
        ],
    },
});

const seed = getComfySeed(prompt, workflow);
assert.equal(seed, String(REAL_SEED), 'only the real Seed primitive remains');
assert.ok(!seed.includes(String(STALE_SAMPLER_A)), 'stale noise_seed A ignored');
assert.ok(!seed.includes(String(STALE_SAMPLER_B)), 'stale noise_seed B ignored');
assert.ok(!seed.includes(String(STALE_IMAGE)), 'stale Image seed ignored');

console.log('metadata-seed.test.ts: all assertions passed');
