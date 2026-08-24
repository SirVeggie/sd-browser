import assert from 'node:assert/strict';
import { discoverCards } from '../src/lib/svgen/fields.ts';
import type { ComfyWorkflow } from '../src/lib/types/images.ts';
import type { ObjectInfoMap } from '../src/lib/svgen/types.ts';

const objectInfo: ObjectInfoMap = {
    'SV-LoraTagLoader': {
        display_name: 'Load LoRA Tag',
        input: {
            required: {
                model: ['MODEL', {}],
                text: ['STRING', { multiline: true }],
            },
            optional: {
                clip: ['CLIP', {}],
            },
        },
        input_order: {
            required: ['model', 'text'],
            optional: ['clip'],
        },
    },
    LoraLoader: {
        display_name: 'Load LoRA',
        input: {
            required: {
                lora_name: ['COMBO', { options: ['wlop.safetensors', 'style/foo.safetensors'] }],
                strength_model: ['FLOAT', { default: 1 }],
                strength_clip: ['FLOAT', { default: 1 }],
            },
        },
    },
};

function loaderWorkflow(opts: {
    text: string;
    clipLinked: boolean;
}): ComfyWorkflow {
    return {
        nodes: [
            {
                id: 7,
                type: 'SV-LoraTagLoader',
                title: 'Load LoRA Tag',
                pos: [0, 0],
                size: [200, 100],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                    {
                        name: 'model',
                        type: 'MODEL',
                        link: 1,
                    },
                    {
                        name: 'clip',
                        type: 'CLIP',
                        link: opts.clipLinked ? 2 : null,
                    },
                    {
                        name: 'text',
                        type: 'STRING',
                        widget: { name: 'text' },
                        link: null,
                    },
                ],
                outputs: [],
                properties: { 'Node name for S&R': 'SV-LoraTagLoader' },
                widgets_values: [opts.text],
            },
        ],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
    };
}

{
    const cards = discoverCards(
        loaderWorkflow({
            text: '<lora:wlop.safetensors:1.2>',
            clipLinked: true,
        }),
        objectInfo,
    );
    assert.equal(cards.length, 1);
    const card = cards[0];
    assert.equal(card.loraTagLoader, true);
    assert.equal(card.clipInputWired, true);
    assert.equal(card.fields.length, 1);
    assert.equal(card.fields[0].kind, 'lora_tags');
    assert.equal(card.fields[0].value, '<lora:wlop.safetensors:1.2>');
    assert.deepEqual(card.fields[0].options?.values, [
        'wlop.safetensors',
        'style/foo.safetensors',
    ]);
}

{
    const cards = discoverCards(
        loaderWorkflow({ text: '', clipLinked: false }),
        objectInfo,
    );
    assert.equal(cards[0].clipInputWired, false);
    assert.equal(cards[0].fields[0].kind, 'lora_tags');
}

{
    const cards = discoverCards(
        loaderWorkflow({
            text: '<lora:wlop.safetensors:1.2>',
            clipLinked: true,
        }),
        null,
    );
    assert.equal(cards[0].loraTagLoader, true, 'custom UI without object_info');
    assert.equal(cards[0].fields[0].kind, 'lora_tags');
}

function loaderWorkflowNoWidgetProp(text: string): ComfyWorkflow {
    const workflow = loaderWorkflow({ text, clipLinked: false });
    const node = workflow.nodes[0];
    node.inputs = node.inputs.map((input) => {
        if (input.name !== 'text')
            return input;
        const { widget: _widget, ...rest } = input;
        return rest;
    });
    return workflow;
}

{
    const cards = discoverCards(
        loaderWorkflowNoWidgetProp('<lora:wlop.safetensors:0.8>'),
        null,
    );
    assert.equal(cards.length, 1, 'card appears without widget prop / object_info');
    assert.equal(cards[0].loraTagLoader, true, 'custom UI when Comfy object_info is missing');
    assert.equal(cards[0].fields[0].kind, 'lora_tags');
    assert.equal(cards[0].fields[0].widgetName, 'text');
    assert.equal(cards[0].fields[0].value, '<lora:wlop.safetensors:0.8>');
}

{
    const workflow = loaderWorkflow({
        text: '<lora:wlop.safetensors:1>',
        clipLinked: false,
    });
    workflow.nodes[0].widgets_values = { text: '<lora:wlop.safetensors:1>' };
    const cards = discoverCards(workflow, null);
    assert.equal(cards[0].loraTagLoader, true, 'dict widgets_values without object_info');
    assert.equal(cards[0].fields[0].kind, 'lora_tags');
}

function subgraphLoaderWorkflow(): ComfyWorkflow {
    const subgraphId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    return {
        nodes: [
            {
                id: 3,
                type: subgraphId,
                title: 'Load LoRA Tag',
                pos: [0, 0],
                size: [200, 100],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                    {
                        name: 'text',
                        type: 'STRING',
                        widget: { name: 'text' },
                        link: null,
                    },
                ],
                outputs: [],
                properties: {},
                widgets_values: ['<lora:style/foo.safetensors:1>'],
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
                    name: 'Load LoRA Tag',
                    inputs: [
                        { name: 'text', type: 'STRING', linkIds: [1] },
                    ],
                    links: [
                        {
                            id: 1,
                            origin_id: -10,
                            origin_slot: 0,
                            target_id: 7,
                            target_slot: 2,
                            type: 'STRING',
                        },
                    ],
                    nodes: [
                        {
                            id: 7,
                            type: 'SV-LoraTagLoader',
                            title: '',
                            pos: [0, 0],
                            size: [200, 100],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: [
                                { name: 'model', type: 'MODEL', link: null },
                                { name: 'clip', type: 'CLIP', link: null },
                                {
                                    name: 'text',
                                    type: 'STRING',
                                    widget: { name: 'text' },
                                    link: 1,
                                },
                            ],
                            outputs: [],
                            properties: { 'Node name for S&R': 'SV-LoraTagLoader' },
                            widgets_values: ['<lora:style/foo.safetensors:1>'],
                        },
                    ],
                },
            ],
        },
    };
}

{
    const cards = discoverCards(subgraphLoaderWorkflow(), null);
    assert.equal(cards.length, 1, 'subgraph shell still yields a card');
    assert.equal(cards[0].loraTagLoader, true, 'subgraph inner SV-LoraTagLoader');
    assert.equal(cards[0].fields.some((f) => f.kind === 'lora_tags'), true);
}

console.log('fields.loraTagLoader.test.ts: ok');
