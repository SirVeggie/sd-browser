import assert from 'node:assert/strict';
import { discoverCards } from '../src/lib/svgen/fields.ts';
import type { ComfyWorkflow } from '../src/lib/types/images.ts';
import type { ObjectInfoMap } from '../src/lib/svgen/types.ts';

/**
 * CustomCombo stores choice as COMBO with empty object_info options; the
 * frontend fills values from option* string widgets. Saved layout:
 * [choice, index, option1, …, ""].
 */
const customComboObjectInfo: ObjectInfoMap = {
    CustomCombo: {
        display_name: 'Custom Combo',
        input: {
            required: {
                choice: ['COMBO', { options: [] }],
            },
        },
        input_order: { required: ['choice'] },
    },
};

function instructionSelectWorkflow(): ComfyWorkflow {
    const subgraphId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
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
                widgets_values: ['simple booru'],
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
                            type: 'CustomCombo',
                            title: '',
                            pos: [0, 0],
                            size: [270, 150],
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
                            properties: { 'Node name for S&R': 'CustomCombo' },
                            widgets_values: [
                                'simple booru',
                                1,
                                'danbooru',
                                'simple booru',
                                'generalist',
                                '',
                            ],
                        },
                    ],
                },
            ],
        },
    };
}

const cards = discoverCards(instructionSelectWorkflow(), customComboObjectInfo);
assert.equal(cards.length, 1, 'one Instruction Select card');
assert.equal(cards[0].fields.length, 1, 'only choice is proxied');
const field = cards[0].fields[0];
assert.equal(field.widgetName, 'choice');
assert.equal(field.kind, 'combo', `expected combo, got ${field.kind}`);
assert.deepEqual(
    field.options?.values,
    ['danbooru', 'simple booru', 'generalist'],
    `combo options from CustomCombo option* widgets, got ${JSON.stringify(field.options?.values)}`,
);
assert.equal(field.value, 'simple booru');

// Without object_info, options still come from widgets_values.
const noInfo = discoverCards(instructionSelectWorkflow(), null);
assert.equal(noInfo[0].fields[0].kind, 'combo');
assert.deepEqual(noInfo[0].fields[0].options?.values, [
    'danbooru',
    'simple booru',
    'generalist',
]);

console.log('fields.customCombo.test.ts passed');
