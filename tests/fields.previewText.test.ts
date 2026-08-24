import assert from 'node:assert/strict';
import { discoverCards } from '../src/lib/svgen/fields.ts';
import type { ComfyWorkflow } from '../src/lib/types/images.ts';

function previewTextWorkflow(): ComfyWorkflow {
    return {
        nodes: [
            {
                id: 99,
                type: 'SV-PreviewText',
                title: 'Preview Text',
                pos: [0, 0],
                size: [200, 120],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                    { name: 'source', type: '*', link: 1 },
                ],
                outputs: [
                    { name: 'text', type: 'STRING', links: null },
                ],
                properties: { 'Node name for S&R': 'SV-PreviewText' },
                // Frontend preview widget is serialize:false — not in widgets_values.
                widgets_values: [],
            },
        ],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
    };
}

const cards = discoverCards(previewTextWorkflow(), null);
assert.equal(cards.length, 1, 'SV-PreviewText should appear as a card');
assert.equal(cards[0].textDisplay, true);
assert.equal(cards[0].imageDisplay, false);
assert.equal(cards[0].fields.length, 0, 'no editable fields');
assert.equal(cards[0].title, 'Preview Text');

console.log('fields.previewText.test.ts passed');
