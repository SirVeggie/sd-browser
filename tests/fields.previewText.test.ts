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

function workflowTimerWorkflow(): ComfyWorkflow {
    return {
        nodes: [
            {
                id: 100,
                type: 'SV-WorkflowTimer',
                title: 'Workflow Timer',
                pos: [0, 0],
                size: [200, 80],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                    { name: 'signal', type: '*', link: 1 },
                ],
                outputs: [
                    { name: 'signal', type: '*', links: null },
                ],
                properties: { 'Node name for S&R': 'SV-WorkflowTimer' },
                widgets_values: [],
            },
        ],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
    };
}

const timerCards = discoverCards(workflowTimerWorkflow(), null);
assert.equal(timerCards.length, 1, 'SV-WorkflowTimer should appear as a card');
assert.equal(timerCards[0].textDisplay, true);
assert.equal(timerCards[0].fields.length, 0, 'no editable fields');

console.log('fields.previewText.test.ts passed');
