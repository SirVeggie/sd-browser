import assert from 'node:assert/strict';
import { emptyLayout } from '../src/lib/svgen/layout.ts';
import {
    matchableFromCards,
    pickBestSavedLayout,
    remapLayoutToCards,
    type SavedLayoutCandidate,
} from '../src/lib/svgen/layoutInherit.ts';
import type { SvgenCard, SvgenField, SvgenLayoutState } from '../src/lib/svgen/types.ts';

function field(nodeId: string, widgetName: string): SvgenField {
    return {
        nodeId,
        nodeType: 'Test',
        nodeTitle: '',
        widgetName,
        label: widgetName,
        kind: 'string',
        value: '',
        valueIndex: 0,
        writeMode: 'outer',
    };
}

function card(nodeId: string, nodeType: string, title: string): SvgenCard {
    return { nodeId, nodeType, title, fields: [field(nodeId, 'text')] };
}

function candidate(
    workflowId: string,
    cards: SvgenCard[],
    source: SavedLayoutCandidate['source'],
    layout: SvgenLayoutState = emptyLayout(),
): SavedLayoutCandidate {
    return {
        workflowId,
        cards: matchableFromCards(cards),
        layout,
        source,
    };
}

const next = [
    card('n1', 'Sampler', 'Sampler'),
    card('n2', 'CLIPTextEncode', 'Prompt'),
];

const matching = [
    card('s1', 'Sampler', 'Sampler'),
    card('s2', 'CLIPTextEncode', 'Prompt'),
];

const partial = [
    card('p1', 'Sampler', 'Sampler'),
    card('p2', 'KSampler', 'Other'),
];

const saved = candidate('saved-1', matching, 'saved');
const opened = candidate('open-1', matching, 'opened');

{
    const best = pickBestSavedLayout(next, [saved, opened]);
    assert.equal(best?.workflowId, 'open-1');
}

{
    const best = pickBestSavedLayout(next, [opened, saved]);
    assert.equal(best?.workflowId, 'open-1');
}

{
    const betterSaved = candidate('saved-better', matching, 'saved');
    const weakerOpened = candidate('open-weaker', partial, 'opened');
    const best = pickBestSavedLayout(next, [betterSaved, weakerOpened]);
    assert.equal(best?.workflowId, 'saved-better');
}

{
    const best = pickBestSavedLayout(next, [saved]);
    assert.equal(best?.workflowId, 'saved-1');
}

{
    const best = pickBestSavedLayout(next, [opened]);
    assert.equal(best?.workflowId, 'open-1');
}

{
    const unmatched = [
        card('u1', 'Foo', 'Foo'),
        card('u2', 'Bar', 'Bar'),
    ];
    const weak = candidate('weak', unmatched, 'saved');
    assert.equal(pickBestSavedLayout(next, [weak]), null);
}

{
    const layout = emptyLayout();
    layout.autocompleteSources.s2 = ['booru', 'custom'];
    const remapped = remapLayoutToCards(
        layout,
        new Map([['s1', 'n1'], ['s2', 'n2']]),
        next,
    );
    assert.deepEqual(remapped.autocompleteSources, {
        n2: ['booru', 'custom'],
    });
}
