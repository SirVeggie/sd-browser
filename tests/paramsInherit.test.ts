import assert from 'node:assert/strict';
import {
    matchCardsByIdentity,
    matchableFromCards,
    remapFieldName,
} from '../src/lib/svgen/layoutInherit.ts';
import { applyParamsFromCards } from '../src/lib/svgen/paramsInherit.ts';
import type { ComfyWorkflow } from '../src/lib/types/images.ts';
import type { SvgenCard, SvgenField } from '../src/lib/svgen/types.ts';

function field(partial: Partial<SvgenField> & Pick<SvgenField, 'nodeId' | 'widgetName' | 'value'>): SvgenField {
    return {
        nodeType: 'Test',
        nodeTitle: '',
        label: partial.widgetName,
        kind: 'string',
        valueIndex: 0,
        writeMode: 'outer',
        ...partial,
    };
}

function card(
    nodeId: string,
    nodeType: string,
    title: string,
    fields: SvgenField[],
): SvgenCard {
    return { nodeId, nodeType, title, fields };
}

function workflowWithValues(nodes: { id: number; values: (string | number | boolean | null)[] }[]): ComfyWorkflow {
    return {
        nodes: nodes.map((n, order) => ({
            id: n.id,
            type: 'Test',
            title: `Node ${n.id}`,
            pos: [0, 0] as [number, number],
            size: [100, 100] as [number, number],
            flags: {},
            order,
            mode: 0,
            inputs: [],
            outputs: [],
            widgets_values: n.values,
            properties: {},
        })),
        links: [],
        groups: [],
        config: {},
        version: 0.4,
    };
}

// --- remapFieldName ---
assert.equal(remapFieldName('text', ['text', 'seed']), 'text');
assert.equal(remapFieldName('Text', ['text']), 'text');
assert.equal(remapFieldName('12:strength', ['strength', 'model']), 'strength');
assert.equal(remapFieldName('missing', ['text']), null);

// --- identity: best type+title match; ambiguous type-only skipped ---
{
    const source = matchableFromCards([
        card('s1', 'CLIPTextEncode', 'Positive', []),
        card('s2', 'CLIPTextEncode', 'Negative', []),
        card('s3', 'KSampler', 'KSampler', []),
        card('s4', 'KSampler', 'KSampler 2', []),
    ]);
    const target = matchableFromCards([
        card('t1', 'CLIPTextEncode', 'Positive', []),
        card('t2', 'CLIPTextEncode', 'Negative', []),
        card('t3', 'KSampler', 'Sampler A', []),
        card('t4', 'KSampler', 'Sampler B', []),
    ]);
    const { savedToNext, matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 2, 'only exact type+title matches when type-only is ambiguous');
    assert.equal(savedToNext.get('s1'), 't1');
    assert.equal(savedToNext.get('s2'), 't2');
    assert.equal(savedToNext.has('s3'), false);
    assert.equal(savedToNext.has('s4'), false);
}

// --- unique type-only match when only one of each ---
{
    const source = matchableFromCards([card('s1', 'KSampler', 'A', [])]);
    const target = matchableFromCards([card('t1', 'KSampler', 'B', [])]);
    const { savedToNext, matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 1);
    assert.equal(savedToNext.get('s1'), 't1');
}

// --- strict pass owns "Name" / "Name 2" before loose fallback ---
// Exact type+title runs first on remaining unmatched only; loose title is a later
// pass and must not claim "KSampler" while "KSampler 2" is still available for exact.
{
    const source = matchableFromCards([
        card('s1', 'KSampler', 'KSampler', []),
        card('s2', 'KSampler', 'KSampler 2', []),
        card('s3', 'LoraLoader', 'Lora', []),
        card('s4', 'LoraLoader', 'Lora (2)', []),
    ]);
    const target = matchableFromCards([
        card('t1', 'KSampler', 'KSampler', []),
        card('t2', 'KSampler', 'KSampler 2', []),
        card('t3', 'LoraLoader', 'Lora', []),
        card('t4', 'LoraLoader', 'Lora (2)', []),
    ]);
    const { savedToNext, matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 4, 'numbered title siblings each keep their exact pair');
    assert.equal(savedToNext.get('s1'), 't1');
    assert.equal(savedToNext.get('s2'), 't2');
    assert.equal(savedToNext.get('s3'), 't3');
    assert.equal(savedToNext.get('s4'), 't4');
}

// --- loose title still matches remainders when exact titles differ ---
{
    const source = matchableFromCards([
        card('s1', 'KSampler', 'KSampler', []),
        card('s2', 'CLIPTextEncode', 'Positive', []),
    ]);
    const target = matchableFromCards([
        card('t1', 'KSampler', 'KSampler 2', []),
        card('t2', 'CLIPTextEncode', 'Positive', []),
    ]);
    const { savedToNext, matched } = matchCardsByIdentity(target, source);
    assert.equal(matched, 2, 'loose type+title pairs leftover after exact pass');
    assert.equal(savedToNext.get('s1'), 't1');
    assert.equal(savedToNext.get('s2'), 't2');
}

// --- same structure with numbered titles: all fields set ---
{
    const sourceCards = [
        card('10', 'KSampler', 'KSampler', [
            field({ nodeId: '10', widgetName: 'seed', value: 1, valueIndex: 0, kind: 'seed' }),
            field({ nodeId: '10', widgetName: 'steps', value: 20, valueIndex: 1, kind: 'number' }),
        ]),
        card('11', 'KSampler', 'KSampler 2', [
            field({ nodeId: '11', widgetName: 'seed', value: 2, valueIndex: 0, kind: 'seed' }),
            field({ nodeId: '11', widgetName: 'steps', value: 30, valueIndex: 1, kind: 'number' }),
        ]),
    ];
    const targetCards = [
        card('1', 'KSampler', 'KSampler', [
            field({ nodeId: '1', widgetName: 'seed', value: 9, valueIndex: 0, kind: 'seed' }),
            field({ nodeId: '1', widgetName: 'steps', value: 20, valueIndex: 1, kind: 'number' }),
        ]),
        card('2', 'KSampler', 'KSampler 2', [
            field({ nodeId: '2', widgetName: 'seed', value: 8, valueIndex: 0, kind: 'seed' }),
            field({ nodeId: '2', widgetName: 'steps', value: 30, valueIndex: 1, kind: 'number' }),
        ]),
    ];
    const targetWorkflow = workflowWithValues([
        { id: 1, values: [9, 20] },
        { id: 2, values: [8, 30] },
    ]);
    const result = applyParamsFromCards({ sourceCards, targetCards, targetWorkflow });
    assert.equal(result.matchedCards, 2);
    assert.equal(result.changedFields, 2);
    assert.equal(result.setFields, 4);
    assert.equal(result.totalFields, 4);
    assert.deepEqual(result.workflow.nodes.find((n) => n.id === 1)!.widgets_values, [1, 20]);
    assert.deepEqual(result.workflow.nodes.find((n) => n.id === 2)!.widgets_values, [2, 30]);
}

// --- applyParamsFromCards copies matched exposed values only ---
{
    const sourceCards = [
        card('10', 'CLIPTextEncode', 'Positive', [
            field({ nodeId: '10', widgetName: 'text', value: 'from image', valueIndex: 0, kind: 'string' }),
        ]),
        card('20', 'KSampler', 'KSampler', [
            field({ nodeId: '20', widgetName: 'seed', value: 12345, valueIndex: 0, kind: 'seed' }),
            field({ nodeId: '20', widgetName: 'steps', value: 30, valueIndex: 1, kind: 'number' }),
        ]),
        card('99', 'LoadImage', 'Load Image', [
            field({ nodeId: '99', widgetName: 'image', value: 'skip.png', valueIndex: 0, kind: 'image' }),
        ]),
    ];
    const targetCards = [
        card('1', 'CLIPTextEncode', 'Positive', [
            field({ nodeId: '1', widgetName: 'text', value: 'old', valueIndex: 0, kind: 'string' }),
        ]),
        card('2', 'KSampler', 'KSampler', [
            field({ nodeId: '2', widgetName: 'seed', value: 1, valueIndex: 0, kind: 'seed' }),
            field({ nodeId: '2', widgetName: 'steps', value: 20, valueIndex: 1, kind: 'number' }),
            field({ nodeId: '2', widgetName: 'cfg', value: 7, valueIndex: 2, kind: 'number' }),
        ]),
        card('3', 'LoadCheckpoint', 'Load Checkpoint', [
            field({ nodeId: '3', widgetName: 'ckpt_name', value: 'model.safetensors', valueIndex: 0, kind: 'combo' }),
        ]),
    ];
    const targetWorkflow = workflowWithValues([
        { id: 1, values: ['old'] },
        { id: 2, values: [1, 20, 7] },
        { id: 3, values: ['model.safetensors'] },
    ]);

    const result = applyParamsFromCards({ sourceCards, targetCards, targetWorkflow });
    assert.equal(result.matchedCards, 2);
    assert.equal(result.changedFields, 3);
    assert.equal(result.setFields, 3);
    assert.equal(result.totalFields, 5, 'text + seed/steps/cfg + ckpt');

    const node1 = result.workflow.nodes.find((n) => n.id === 1)!;
    const node2 = result.workflow.nodes.find((n) => n.id === 2)!;
    const node3 = result.workflow.nodes.find((n) => n.id === 3)!;
    assert.deepEqual(node1.widgets_values, ['from image']);
    assert.deepEqual(node2.widgets_values, [12345, 30, 7], 'cfg untouched; seed/steps copied');
    assert.deepEqual(node3.widgets_values, ['model.safetensors'], 'unmatched node untouched');
}

// --- unchanged values still count as set ---
{
    const sourceCards = [
        card('10', 'CLIPTextEncode', 'Positive', [
            field({ nodeId: '10', widgetName: 'text', value: 'same', valueIndex: 0, kind: 'string' }),
        ]),
        card('20', 'KSampler', 'KSampler', [
            field({ nodeId: '20', widgetName: 'seed', value: 99, valueIndex: 0, kind: 'seed' }),
        ]),
    ];
    const targetCards = [
        card('1', 'CLIPTextEncode', 'Positive', [
            field({ nodeId: '1', widgetName: 'text', value: 'same', valueIndex: 0, kind: 'string' }),
        ]),
        card('2', 'KSampler', 'KSampler', [
            field({ nodeId: '2', widgetName: 'seed', value: 1, valueIndex: 0, kind: 'seed' }),
            field({ nodeId: '2', widgetName: 'steps', value: 20, valueIndex: 1, kind: 'number' }),
        ]),
    ];
    const targetWorkflow = workflowWithValues([
        { id: 1, values: ['same'] },
        { id: 2, values: [1, 20] },
    ]);
    const result = applyParamsFromCards({ sourceCards, targetCards, targetWorkflow });
    assert.equal(result.matchedCards, 2);
    assert.equal(result.changedFields, 1);
    assert.equal(result.setFields, 2, 'same text still counts as set');
    assert.equal(result.totalFields, 3);
    assert.deepEqual(result.workflow.nodes.find((n) => n.id === 2)!.widgets_values, [99, 20]);
}

// --- kind mismatch skips copy ---
{
    const sourceCards = [
        card('1', 'Test', 'Same', [
            field({ nodeId: '1', widgetName: 'value', value: true, valueIndex: 0, kind: 'boolean' }),
        ]),
    ];
    const targetCards = [
        card('1', 'Test', 'Same', [
            field({ nodeId: '1', widgetName: 'value', value: 'keep', valueIndex: 0, kind: 'string' }),
        ]),
    ];
    const targetWorkflow = workflowWithValues([{ id: 1, values: ['keep'] }]);
    const result = applyParamsFromCards({ sourceCards, targetCards, targetWorkflow });
    assert.equal(result.matchedCards, 1);
    assert.equal(result.changedFields, 0);
    assert.equal(result.setFields, 0);
    assert.equal(result.totalFields, 1);
    assert.deepEqual(result.workflow.nodes[0]!.widgets_values, ['keep']);
}

// --- exact title wins over loose-title sibling ---
{
    const sourceCards = [
        card('10', 'CLIPTextEncode', 'Positive', [
            field({ nodeId: '10', widgetName: 'text', value: 'pos', valueIndex: 0 }),
        ]),
        card('11', 'CLIPTextEncode', 'Positive 2', [
            field({ nodeId: '11', widgetName: 'text', value: 'other', valueIndex: 0 }),
        ]),
    ];
    const targetCards = [
        card('1', 'CLIPTextEncode', 'Positive', [
            field({ nodeId: '1', widgetName: 'text', value: 'old', valueIndex: 0 }),
        ]),
    ];
    const targetWorkflow = workflowWithValues([{ id: 1, values: ['old'] }]);
    const result = applyParamsFromCards({ sourceCards, targetCards, targetWorkflow });
    assert.equal(result.matchedCards, 1, 'exact title wins over loose title sibling');
    assert.equal(result.changedFields, 1);
    assert.equal(result.setFields, 1);
    assert.equal(result.totalFields, 1);
    assert.deepEqual(result.workflow.nodes[0]!.widgets_values, ['pos']);
}

console.log('paramsInherit.test.ts: ok');
