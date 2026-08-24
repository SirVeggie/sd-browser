import assert from 'node:assert/strict';
import { discoverCards } from '../src/lib/svgen/fields.ts';
import type { ComfyWorkflow } from '../src/lib/types/images.ts';
import type { ObjectInfoMap } from '../src/lib/svgen/types.ts';

/**
 * SV-Combo stores options as one comma-separated string.
 * Saved layout: [choice, options].
 * object_info still lists default combo options — panel must use the string.
 */
const svComboObjectInfo: ObjectInfoMap = {
    'SV-Combo': {
        display_name: 'SV Combo',
        input: {
            required: {
                choice: [
                    'COMBO',
                    { options: ['option1', 'option2', 'option3'] },
                ],
                options: ['STRING', {}],
            },
        },
        input_order: { required: ['choice', 'options'] },
    },
};

function instructionSelectWorkflow(): ComfyWorkflow {
    const subgraphId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
    return {
        nodes: [
            {
                id: 42,
                type: subgraphId,
                title: 'Instruction Select',
                pos: [0, 0],
                size: [200, 100],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                    {
                        name: 'choice',
                        type: 'COMBO',
                        widget: { name: 'choice' },
                        link: null,
                    },
                ],
                outputs: [],
                properties: {
                    proxyWidgets: [['7', 'choice']],
                },
                widgets_values: ['generalist'],
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
                    name: 'Instruction Select',
                    nodes: [
                        {
                            id: 7,
                            type: 'SV-Combo',
                            title: '',
                            pos: [0, 0],
                            size: [270, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [
                                {
                                    name: 'choice',
                                    type: 'COMBO',
                                    widget: { name: 'choice' },
                                    link: null,
                                },
                                {
                                    name: 'options',
                                    type: 'STRING',
                                    widget: { name: 'options' },
                                    link: null,
                                },
                            ],
                            outputs: [],
                            properties: { 'Node name for S&R': 'SV-Combo' },
                            widgets_values: [
                                'generalist',
                                'danbooru, simple booru, generalist',
                            ],
                        },
                    ],
                },
            ],
        },
    };
}

function topLevelWorkflow(): ComfyWorkflow {
    return {
        nodes: [
            {
                id: 3,
                type: 'SV-Combo',
                title: 'SV Combo',
                pos: [0, 0],
                size: [270, 100],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                    {
                        name: 'choice',
                        type: 'COMBO',
                        widget: { name: 'choice' },
                        link: null,
                    },
                    {
                        name: 'options',
                        type: 'STRING',
                        widget: { name: 'options' },
                        link: null,
                    },
                ],
                outputs: [],
                properties: { 'Node name for S&R': 'SV-Combo' },
                widgets_values: [
                    'simple booru',
                    'danbooru, simple booru, generalist',
                ],
            },
        ],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
    };
}

const cards = discoverCards(instructionSelectWorkflow(), svComboObjectInfo);
assert.equal(cards.length, 1, 'one Instruction Select card');
assert.equal(cards[0].fields.length, 1, 'only choice is proxied');
const field = cards[0].fields[0];
assert.equal(field.widgetName, 'choice');
assert.equal(field.kind, 'combo', `expected combo, got ${field.kind}`);
assert.deepEqual(
    field.options?.values,
    ['danbooru', 'simple booru', 'generalist'],
    `combo options from SV-Combo options string, got ${JSON.stringify(field.options?.values)}`,
);
assert.equal(field.value, 'generalist');

// Without object_info, options still come from widgets_values.
const noInfo = discoverCards(instructionSelectWorkflow(), null);
assert.equal(noInfo[0].fields[0].kind, 'combo');
assert.deepEqual(noInfo[0].fields[0].options?.values, [
    'danbooru',
    'simple booru',
    'generalist',
]);

// Top-level node: choice must override schema defaults; options field also shows.
const top = discoverCards(topLevelWorkflow(), svComboObjectInfo);
assert.equal(top.length, 1);
const choice = top[0].fields.find((f) => f.widgetName === 'choice');
const options = top[0].fields.find((f) => f.widgetName === 'options');
assert.ok(choice, 'choice field');
assert.ok(options, 'options field');
assert.equal(choice.kind, 'combo');
assert.deepEqual(choice.options?.values, [
    'danbooru',
    'simple booru',
    'generalist',
]);
assert.equal(choice.value, 'simple booru');
assert.equal(options.kind, 'string');
assert.equal(options.value, 'danbooru, simple booru, generalist');

console.log('fields.svCombo.test.ts passed');
