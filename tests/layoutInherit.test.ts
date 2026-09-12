import assert from 'node:assert/strict';
import { emptyLayout, signaturesFromCards } from '../src/lib/svgen/layout.ts';
import {
    matchCardsByIdentity,
    matchableFromCards,
    matchableFromSignatures,
    pickBestSavedLayout,
    remapLayoutToCards,
    type SavedLayoutCandidate,
} from '../src/lib/svgen/layoutInherit.ts';
import type { SvgenCard, SvgenField, SvgenLayoutState } from '../src/lib/svgen/types.ts';

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UUID_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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

function subgraphCard(
    nodeId: string,
    nodeType: string,
    title: string,
    fieldNames: string[],
    subgraphName = '',
): SvgenCard {
    return {
        nodeId,
        nodeType,
        title,
        subgraphName: subgraphName || undefined,
        fields: fieldNames.map((name) => field(nodeId, name)),
    };
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

{
    const source = matchableFromCards([
        subgraphCard('10', UUID_A, 'Pack', ['seed', 'steps'], 'Pack'),
        card('11', 'CLIPTextEncode', 'Pack'),
    ]);
    const target = matchableFromCards([
        subgraphCard('10', UUID_B, 'Pack', ['seed', 'steps', 'cfg'], 'Pack'),
        card('12', 'LoadImage', 'Pack'),
    ]);
    const { savedToNext, matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 1, 'UUID unique title still pairs when a concrete leftover shares the title');
    assert.equal(savedToNext.get('10'), '10');
    assert.equal(savedToNext.has('11'), false);
}

{
    const source = matchableFromCards([
        subgraphCard('10', UUID_A, 'Pack', ['seed', 'steps'], 'Pack'),
        subgraphCard('11', UUID_A, 'Pack', ['seed', 'steps'], 'Pack'),
    ]);
    const target = matchableFromCards([
        subgraphCard('10', UUID_B, 'Pack', ['seed', 'steps', 'cfg'], 'Pack'),
        subgraphCard('11', UUID_B, 'Pack', ['seed', 'steps', 'cfg'], 'Pack'),
    ]);
    const { savedToNext, matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 2, 'duplicate UUID titles pair by matching node id');
    assert.equal(savedToNext.get('10'), '10');
    assert.equal(savedToNext.get('11'), '11');
}

{
    const source = matchableFromCards([
        subgraphCard('10', UUID_A, 'Pack', ['seed', 'steps'], 'Pack'),
        subgraphCard('11', UUID_A, 'Pack', ['seed', 'steps'], 'Pack'),
    ]);
    const target = matchableFromCards([
        subgraphCard('20', UUID_B, 'Pack', ['seed', 'steps', 'cfg'], 'Pack'),
        subgraphCard('21', UUID_B, 'Pack', ['seed', 'steps', 'cfg'], 'Pack'),
    ]);
    const { savedToNext, matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 2, 'duplicate UUID titles with new ids keep leftover order');
    assert.equal(savedToNext.get('10'), '20');
    assert.equal(savedToNext.get('11'), '21');
}

{
    const source = matchableFromCards([
        subgraphCard('10', UUID_A, 'Pack', ['seed', 'steps'], 'Pack'),
        subgraphCard('11', UUID_A, 'Pack', ['seed', 'steps'], 'Pack'),
    ]);
    const target = matchableFromCards([
        subgraphCard('10', UUID_B, 'Pack', ['seed', 'steps', 'cfg'], 'Pack'),
        subgraphCard('11', UUID_B, 'Pack', ['seed', 'steps', 'denoise'], 'Pack'),
    ]);
    const { savedToNext, matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 2, 'copy-both-modified same title still pairs by id');
    assert.equal(savedToNext.get('10'), '10');
    assert.equal(savedToNext.get('11'), '11');
}

{
    const source = matchableFromCards([
        subgraphCard('10', UUID_A, 'Main', ['seed', 'steps', 'cfg']),
        card('11', 'CLIPTextEncode', 'Prompt'),
    ]);
    const target = matchableFromCards([
        subgraphCard('10', UUID_B, 'Other', ['seed', 'steps', 'cfg', 'denoise']),
        card('11', 'CLIPTextEncode', 'Prompt'),
    ]);
    const { savedToNext, matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 2, 'retitled UUID subgraph pairs by field overlap');
    assert.equal(savedToNext.get('10'), '10');
    assert.equal(savedToNext.get('11'), '11');
}

{
    const source = matchableFromCards([
        card('s1', 'CLIPTextEncode', 'Positive'),
        card('s2', 'CLIPTextEncode', 'Negative'),
    ]);
    const target = matchableFromCards([
        card('t1', 'CLIPTextEncode', 'Pos'),
        card('t2', 'CLIPTextEncode', 'Neg'),
    ]);
    const { matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 0, 'non-UUID leftover text cards do not pair on field overlap');
}

{
    const parsed = matchableFromSignatures({
        '1': `KSampler\u0000KSampler\u0000`,
    });
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.nodeType, 'KSampler');
    assert.equal(parsed[0]?.title, 'KSampler');
    assert.equal(parsed[0]?.subgraphName, '');
    assert.deepEqual(parsed[0]?.fieldNames, []);
}

{
    const cards = [
        subgraphCard('10', UUID_A, 'Main', ['seed', 'steps'], 'Pack'),
    ];
    const signatures = signaturesFromCards(cards);
    const parsed = matchableFromSignatures(signatures);
    assert.equal(parsed[0]?.nodeType, UUID_A);
    assert.equal(parsed[0]?.title, 'Main');
    assert.equal(parsed[0]?.subgraphName, 'Pack');
    assert.deepEqual(parsed[0]?.fieldNames, ['seed', 'steps']);
}

{
    const source = matchableFromCards([
        subgraphCard('10', UUID_A, 'Alpha', ['seed', 'steps', 'cfg'], 'Alpha'),
        subgraphCard('11', UUID_C, 'Beta', ['width', 'height', 'batch'], 'Beta'),
    ]);
    const target = matchableFromCards([
        subgraphCard('20', UUID_B, 'Renamed', ['seed', 'steps', 'cfg'], 'Alpha'),
        subgraphCard('21', UUID_D, 'Side2', ['width', 'height', 'batch'], 'Beta'),
    ]);
    const { savedToNext, matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 2, 'unique subgraph names recover retitled UUID shells');
    assert.equal(savedToNext.get('10'), '20');
    assert.equal(savedToNext.get('11'), '21');
}

console.log('layoutInherit.test.ts: ok');
