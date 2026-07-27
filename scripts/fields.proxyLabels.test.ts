import assert from 'node:assert/strict';
import { discoverCards } from '../src/lib/svgen/fields.ts';
import type { ComfyWorkflow } from '../src/lib/types/images.ts';

/**
 * LLM Prompt subgraph: several Primitive/Integer proxies share inner widget
 * name `value`, promoted on the outer node as value / value_1 / value_2 with
 * distinct labels (images / refine / combine).
 */
function llmPromptDuplicateValueWorkflow(): ComfyWorkflow {
    const subgraphId = '5d3d3f86-e65d-4206-87a8-58e59ab2f9f3';
    return {
        nodes: [
            {
                id: 881,
                type: subgraphId,
                title: 'LLM Prompt',
                pos: [0, 0],
                size: [200, 200],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                    { name: 'value', label: 'images', widget: { name: 'value' }, link: null },
                    { name: 'value_1', label: 'refine', widget: { name: 'value_1' }, link: null },
                    { name: 'value_2', label: 'combine', widget: { name: 'value_2' }, link: null },
                    { name: 'thinking', widget: { name: 'thinking' }, link: null },
                    { name: 'prefetch', widget: { name: 'prefetch' }, link: null },
                    { name: 'provider', label: '_provider', widget: { name: 'provider' }, link: null },
                    { name: 'model', label: '_model', widget: { name: 'model' }, link: null },
                ],
                outputs: [],
                properties: {
                    proxyWidgets: [
                        ['1037', 'value'],
                        ['832', 'value'],
                        ['846', 'value'],
                        ['831', 'thinking'],
                        ['837', 'prefetch'],
                        ['837', 'provider'],
                        ['837', 'model'],
                    ],
                },
                widgets_values: [],
            },
        ],
        links: [],
        groups: [],
        config: {},
        extra: {},
        version: 0.4,
        definitions: {
            subgraphs: [
                {
                    id: subgraphId,
                    name: 'LLM Prompt',
                    nodes: [
                        {
                            id: 1037,
                            type: 'SV-Integer',
                            title: '',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [{ name: 'value', widget: { name: 'value' }, link: null }],
                            outputs: [],
                            properties: {},
                            widgets_values: [1],
                        },
                        {
                            id: 832,
                            type: 'PrimitiveBoolean',
                            title: 'Refine',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [
                                {
                                    name: 'value',
                                    label: 'refine',
                                    widget: { name: 'value' },
                                    link: null,
                                },
                            ],
                            outputs: [],
                            properties: {},
                            widgets_values: [true],
                        },
                        {
                            id: 846,
                            type: 'PrimitiveBoolean',
                            title: 'Combine',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [
                                {
                                    name: 'value',
                                    label: 'combine img',
                                    widget: { name: 'value' },
                                    link: null,
                                },
                            ],
                            outputs: [],
                            properties: {},
                            widgets_values: [false],
                        },
                        {
                            id: 831,
                            type: 'SV-LLMArgs',
                            title: '',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [{ name: 'thinking', widget: { name: 'thinking' }, link: null }],
                            outputs: [],
                            properties: {},
                            widgets_values: [false],
                        },
                        {
                            id: 837,
                            type: 'SV-LLMRequest',
                            title: '',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [
                                { name: 'provider', widget: { name: 'provider' }, link: null },
                                { name: 'model', widget: { name: 'model' }, link: null },
                                { name: 'prefetch', widget: { name: 'prefetch' }, link: null },
                            ],
                            outputs: [],
                            properties: {},
                            widgets_values: ['Remote', 'model', '', true],
                        },
                    ],
                    links: [],
                    groups: [],
                    config: {},
                    extra: {},
                    version: 0.4,
                },
            ],
        },
    };
}

const cards = discoverCards(llmPromptDuplicateValueWorkflow());
assert.equal(cards.length, 1, 'one LLM Prompt card');
const labels = cards[0].fields.map((f) => f.label);
const names = cards[0].fields.map((f) => f.widgetName);

assert.deepEqual(
    labels,
    ['images', 'refine', 'combine', 'thinking', 'prefetch'],
    `labels should be unique outer renames, got ${JSON.stringify(labels)}`,
);
assert.deepEqual(
    names,
    ['value', 'value_1', 'value_2', 'thinking', 'prefetch'],
    `widget names should be disambiguated, got ${JSON.stringify(names)}`,
);
assert.equal(cards[0].fields[0].value, 1);
assert.equal(cards[0].fields[1].value, true);
assert.equal(cards[0].fields[2].value, false);

/**
 * Sampler-shaped subgraph: proxyWidgets lists Steps before Seed, but Comfy's
 * outer sockets give Seed the wired `value` and Steps `value_1`. Occurrence-based
 * naming hid Steps and shifted Start/Switch onto the wrong labels.
 */
function samplerProxyOrderWorkflow(): ComfyWorkflow {
    const subgraphId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    return {
        nodes: [
            {
                id: 932,
                type: subgraphId,
                title: 'Sampler',
                pos: [0, 0],
                size: [200, 200],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                    { name: 'value', label: 'seed', link: 1 },
                    { name: 'value_1', label: 'steps', widget: { name: 'value_1' }, link: null },
                    { name: 'float', label: 'cfg 1', widget: { name: 'float' }, link: null },
                    { name: 'float_1', label: 'cfg 2', widget: { name: 'float_1' }, link: null },
                    { name: 'value_2', label: 'start', widget: { name: 'value_2' }, link: null },
                    { name: 'value_3', label: 'switch', widget: { name: 'value_3' }, link: null },
                ],
                outputs: [],
                properties: {
                    // Deliberately NOT outer-socket order: Steps, cfg…, Start, Switch, Seed
                    proxyWidgets: [
                        ['927', 'value'],
                        ['925', 'float'],
                        ['926', 'float'],
                        ['923', 'value'],
                        ['924', 'value'],
                        ['928', 'value'],
                        ['959', 'value'],
                    ],
                },
                widgets_values: [],
            },
        ],
        links: [],
        groups: [],
        config: {},
        extra: {},
        version: 0.4,
        definitions: {
            subgraphs: [
                {
                    id: subgraphId,
                    name: 'Sampler',
                    nodes: [
                        {
                            id: 927,
                            type: 'SV-Integer',
                            title: 'Steps',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [{
                                name: 'value',
                                label: 'steps',
                                widget: { name: 'value' },
                                link: 1,
                            }],
                            outputs: [],
                            properties: {},
                            widgets_values: [20],
                        },
                        {
                            id: 925,
                            type: 'SV-PrimitiveFloat',
                            title: '',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [{
                                name: 'float',
                                label: 'cfg 1',
                                widget: { name: 'float' },
                                link: 1,
                            }],
                            outputs: [],
                            properties: {},
                            widgets_values: [1],
                        },
                        {
                            id: 926,
                            type: 'SV-PrimitiveFloat',
                            title: '',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [{
                                name: 'float',
                                label: 'cfg 2',
                                widget: { name: 'float' },
                                link: 1,
                            }],
                            outputs: [],
                            properties: {},
                            widgets_values: [1],
                        },
                        {
                            id: 923,
                            type: 'SV-Integer',
                            title: 'Start',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [{
                                name: 'value',
                                label: 'start',
                                widget: { name: 'value' },
                                link: 1,
                            }],
                            outputs: [],
                            properties: {},
                            widgets_values: [2],
                        },
                        {
                            id: 924,
                            type: 'SV-Integer',
                            title: 'Switch',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [{
                                name: 'value',
                                label: 'switch',
                                widget: { name: 'value' },
                                link: 1,
                            }],
                            outputs: [],
                            properties: {},
                            widgets_values: [20],
                        },
                        {
                            id: 928,
                            type: 'SV-Integer',
                            title: 'Seed',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [{
                                name: 'value',
                                label: 'seed',
                                widget: { name: 'value' },
                                link: 1,
                            }],
                            outputs: [],
                            properties: {},
                            widgets_values: [0],
                        },
                        {
                            // Promoted widget with no outer socket (Sampler Hires enable)
                            id: 959,
                            type: 'PrimitiveBoolean',
                            title: 'Enable',
                            pos: [0, 0],
                            size: [100, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [{
                                name: 'value',
                                label: 'enable',
                                widget: { name: 'value' },
                                link: 1,
                            }],
                            outputs: [],
                            properties: {},
                            widgets_values: [false],
                        },
                    ],
                    links: [],
                    groups: [],
                    config: {},
                    extra: {},
                    version: 0.4,
                },
            ],
        },
    };
}

const samplerCards = discoverCards(samplerProxyOrderWorkflow());
assert.equal(samplerCards.length, 1, 'one Sampler card');
const samplerFields = samplerCards[0].fields.map((f) => ({
    name: f.widgetName,
    label: f.label,
    value: f.value,
}));
assert.deepEqual(
    samplerFields,
    [
        { name: 'value_1', label: 'steps', value: 20 },
        { name: 'float', label: 'cfg 1', value: 1 },
        { name: 'float_1', label: 'cfg 2', value: 1 },
        { name: 'value_2', label: 'start', value: 2 },
        { name: 'value_3', label: 'switch', value: 20 },
        { name: 'enable', label: 'enable', value: false },
    ],
    `Sampler fields should follow outer sockets (seed hidden), got ${JSON.stringify(samplerFields)}`,
);

console.log('fields.proxyLabels.test.ts passed');
