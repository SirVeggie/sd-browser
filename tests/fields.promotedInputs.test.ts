import assert from 'node:assert/strict';
import { discoverCards, setWidgetValue } from '../src/lib/svgen/fields.ts';
import type { ComfyWorkflow } from '../src/lib/types/images.ts';

/**
 * Modern Comfy exports (no properties.proxyWidgets): promoted widgets are
 * subgraph inputs linked from inputNode (-10) onto interior widget slots, with
 * instance values on the outer shell's widgets_values.
 */
function promotedPromptWorkflow(): ComfyWorkflow {
    const subgraphId = '2025e321-a3fb-43ba-bc36-ac6d9779fdd4';
    return {
        nodes: [
            {
                id: 132,
                type: subgraphId,
                pos: [0, 0],
                size: [330, 270],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                    {
                        label: 'prompt',
                        name: 'text',
                        type: 'STRING',
                        widget: { name: 'text' },
                        link: null,
                    },
                    {
                        label: 'seconds',
                        name: 'value_1',
                        type: 'INT',
                        widget: { name: 'value_1' },
                        link: null,
                    },
                    {
                        label: 'image ref',
                        name: 'value',
                        type: 'BOOLEAN',
                        widget: { name: 'value' },
                        link: null,
                    },
                    {
                        label: 'first frame',
                        name: 'value_2',
                        type: 'BOOLEAN',
                        widget: { name: 'value_2' },
                        link: null,
                    },
                    {
                        label: 'last frame',
                        name: 'choice',
                        type: 'COMBO',
                        widget: { name: 'choice' },
                        link: null,
                    },
                ],
                outputs: [],
                properties: {
                    cnr_id: 'comfy-core',
                    previewExposures: [],
                },
                widgets_values: [
                    'idle animation prompt',
                    10,
                    true,
                    true,
                    'Disabled',
                ],
            },
        ],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
        definitions: {
            subgraphs: [
                {
                    id: subgraphId,
                    name: 'Prompt',
                    inputs: [
                        { name: 'text', type: 'STRING', linkIds: [249], label: 'prompt' },
                        { name: 'value_1', type: 'INT', linkIds: [250], label: 'seconds' },
                        { name: 'value', type: 'BOOLEAN', linkIds: [248], label: 'image ref' },
                        { name: 'value_2', type: 'BOOLEAN', linkIds: [251], label: 'first frame' },
                        { name: 'choice', type: 'COMBO', linkIds: [255], label: 'last frame' },
                    ],
                    links: [
                        {
                            id: 248,
                            origin_id: -10,
                            origin_slot: 2,
                            target_id: 125,
                            target_slot: 0,
                            type: 'BOOLEAN',
                        },
                        {
                            id: 249,
                            origin_id: -10,
                            origin_slot: 0,
                            target_id: 128,
                            target_slot: 0,
                            type: 'STRING',
                        },
                        {
                            id: 250,
                            origin_id: -10,
                            origin_slot: 1,
                            target_id: 130,
                            target_slot: 0,
                            type: 'INT',
                        },
                        {
                            id: 251,
                            origin_id: -10,
                            origin_slot: 3,
                            target_id: 133,
                            target_slot: 0,
                            type: 'BOOLEAN',
                        },
                        {
                            id: 255,
                            origin_id: -10,
                            origin_slot: 4,
                            target_id: 135,
                            target_slot: 0,
                            type: 'COMBO',
                        },
                    ],
                    nodes: [
                        {
                            id: 125,
                            type: 'PrimitiveBoolean',
                            title: 'Prompt Image Reference',
                            pos: [0, 0],
                            size: [270, 60],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [
                                {
                                    name: 'value',
                                    type: 'BOOLEAN',
                                    widget: { name: 'value' },
                                    link: 248,
                                },
                            ],
                            outputs: [],
                            properties: { 'Node name for S&R': 'PrimitiveBoolean' },
                            widgets_values: [true],
                        },
                        {
                            id: 128,
                            type: 'SV-SimpleText',
                            title: 'Prompt',
                            pos: [0, 0],
                            size: [400, 200],
                            flags: {},
                            order: 1,
                            mode: 0,
                            inputs: [
                                {
                                    name: 'text',
                                    type: 'STRING',
                                    widget: { name: 'text' },
                                    link: 249,
                                },
                            ],
                            outputs: [],
                            properties: { 'Node name for S&R': 'SV-SimpleText' },
                            widgets_values: ['definition default'],
                        },
                        {
                            id: 130,
                            type: 'SV-Integer',
                            title: 'Seconds',
                            pos: [0, 0],
                            size: [210, 60],
                            flags: {},
                            order: 2,
                            mode: 0,
                            inputs: [
                                {
                                    name: 'value',
                                    type: 'INT',
                                    widget: { name: 'value' },
                                    link: 250,
                                },
                            ],
                            outputs: [],
                            properties: { 'Node name for S&R': 'SV-Integer' },
                            widgets_values: [0],
                        },
                        {
                            id: 133,
                            type: 'PrimitiveBoolean',
                            title: 'First Frame',
                            pos: [0, 0],
                            size: [270, 60],
                            flags: {},
                            order: 3,
                            mode: 0,
                            inputs: [
                                {
                                    name: 'value',
                                    type: 'BOOLEAN',
                                    widget: { name: 'value' },
                                    link: 251,
                                },
                            ],
                            outputs: [],
                            properties: { 'Node name for S&R': 'PrimitiveBoolean' },
                            widgets_values: [true],
                        },
                        {
                            id: 135,
                            type: 'CustomCombo',
                            pos: [0, 0],
                            size: [270, 180],
                            flags: {},
                            order: 4,
                            mode: 0,
                            inputs: [
                                {
                                    name: 'choice',
                                    type: 'COMBO',
                                    widget: { name: 'choice' },
                                    link: 255,
                                },
                            ],
                            outputs: [],
                            properties: { 'Node name for S&R': 'CustomCombo' },
                            widgets_values: [
                                'Disabled',
                                0,
                                'Disabled',
                                'Enabled',
                                '',
                            ],
                        },
                    ],
                },
            ],
        },
    };
}

const cards = discoverCards(promotedPromptWorkflow(), null);
assert.equal(cards.length, 1, 'Prompt subgraph card should appear without proxyWidgets');
assert.equal(cards[0].title, 'Prompt');

const fields = cards[0].fields.map((f) => ({
    name: f.widgetName,
    label: f.label,
    kind: f.kind,
    value: f.value,
}));
assert.deepEqual(
    fields,
    [
        { name: 'text', label: 'prompt', kind: 'string', value: 'idle animation prompt' },
        { name: 'value_1', label: 'seconds', kind: 'number', value: 10 },
        { name: 'value', label: 'image ref', kind: 'boolean', value: true },
        { name: 'value_2', label: 'first frame', kind: 'boolean', value: true },
        { name: 'choice', label: 'last frame', kind: 'combo', value: 'Disabled' },
    ],
    `promoted fields mismatch: ${JSON.stringify(fields)}`,
);

const choice = cards[0].fields.find((f) => f.widgetName === 'choice');
assert.ok(choice, 'choice field');
assert.deepEqual(
    choice.options?.values,
    ['Disabled', 'Enabled'],
    `CustomCombo options from interior widgets_values, got ${JSON.stringify(choice.options?.values)}`,
);

const promptField = cards[0].fields.find((f) => f.widgetName === 'text');
assert.ok(promptField, 'prompt field');
const written = setWidgetValue(
    promotedPromptWorkflow(),
    '132',
    'text',
    'updated prompt',
    promptField.valueIndex,
    promptField.writeMode,
    promptField.innerNodeId,
    promptField.outerValueIndex,
);
const outer = written.nodes.find((n) => String(n.id) === '132');
assert.equal(
    Array.isArray(outer?.widgets_values) ? outer?.widgets_values[0] : null,
    'updated prompt',
    'writes should land on outer widgets_values',
);

console.log('fields.promotedInputs.test.ts passed');
