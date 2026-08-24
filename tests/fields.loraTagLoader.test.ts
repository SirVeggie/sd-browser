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

console.log('fields.loraTagLoader.test.ts: ok');
