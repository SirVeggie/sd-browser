import assert from 'node:assert/strict';
import { discoverCards } from '../src/lib/svgen/fields.ts';
import type {
    ComfySubgraphDefinition,
    ComfyWorkflow,
    ComfyWorkflowNode,
} from '../src/lib/types/images.ts';
import type { ObjectInfoMap } from '../src/lib/svgen/types.ts';

/**
 * SV-Float stores constraints as sibling widgets.
 * Saved layout: [value, min, max, step, decimals].
 * object_info still lists default 0–1 / 0.01 — panel must use the siblings.
 */
const svFloatObjectInfo: ObjectInfoMap = {
    'SV-Float': {
        display_name: 'SV Float',
        input: {
            required: {
                value: ['FLOAT', { default: 0, min: 0, max: 1, step: 0.01 }],
                min: ['FLOAT', { default: 0, min: -1_000_000_000, max: 1_000_000_000, step: 0.01 }],
                max: ['FLOAT', { default: 1, min: -1_000_000_000, max: 1_000_000_000, step: 0.01 }],
                step: ['FLOAT', { default: 0.01, min: 1e-6, max: 1_000_000_000, step: 0.001 }],
                decimals: ['INT', { default: 2, min: 0, max: 8, step: 1 }],
            },
        },
        input_order: { required: ['value', 'min', 'max', 'step', 'decimals'] },
    },
};

const FLOAT_INPUTS: ComfyWorkflowNode['inputs'] = [
    { name: 'value', type: 'FLOAT', widget: { name: 'value' }, link: null },
    { name: 'min', type: 'FLOAT', widget: { name: 'min' }, link: null },
    { name: 'max', type: 'FLOAT', widget: { name: 'max' }, link: null },
    { name: 'step', type: 'FLOAT', widget: { name: 'step' }, link: null },
    { name: 'decimals', type: 'INT', widget: { name: 'decimals' }, link: null },
];

const CUSTOM_VALUES = [0.75, -5, 10, 0.05, 3];

function subgraphWorkflow(): ComfyWorkflow {
    const subgraphId = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
    return {
        nodes: [
            {
                id: 42,
                type: subgraphId,
                title: 'CFG Scale',
                pos: [0, 0],
                size: [200, 100],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                    {
                        name: 'value',
                        type: 'FLOAT',
                        widget: { name: 'value' },
                        link: null,
                    },
                ],
                outputs: [],
                properties: {
                    proxyWidgets: [['7', 'value']],
                },
                widgets_values: [0.75],
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
                    name: 'CFG Scale',
                    nodes: [
                        {
                            id: 7,
                            type: 'SV-Float',
                            title: '',
                            pos: [0, 0],
                            size: [270, 130],
                            flags: {},
                            order: 0,
                            mode: 0,
                            inputs: FLOAT_INPUTS,
                            outputs: [],
                            properties: { 'Node name for S&R': 'SV-Float' },
                            widgets_values: CUSTOM_VALUES,
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
                type: 'SV-Float',
                title: 'SV Float',
                pos: [0, 0],
                size: [270, 130],
                flags: {},
                order: 0,
                mode: 0,
                inputs: FLOAT_INPUTS,
                outputs: [],
                properties: { 'Node name for S&R': 'SV-Float' },
                widgets_values: CUSTOM_VALUES,
            },
        ],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
    };
}

function baseNode(
    partial: Partial<ComfyWorkflowNode> & Pick<ComfyWorkflowNode, 'id' | 'type'>,
): ComfyWorkflowNode {
    return {
        pos: [0, 0],
        size: [200, 100],
        flags: {},
        order: 0,
        mode: 0,
        inputs: [],
        outputs: [],
        properties: {},
        widgets_values: [],
        ...partial,
    };
}

function twoDeepWorkflow(): ComfyWorkflow {
    const OUTER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const INNER_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    const leaf = baseNode({
        id: 7,
        type: 'SV-Float',
        properties: { 'Node name for S&R': 'SV-Float' },
        inputs: [
            { name: 'value', type: 'FLOAT', widget: { name: 'value' }, link: 2 },
            { name: 'min', type: 'FLOAT', widget: { name: 'min' }, link: null },
            { name: 'max', type: 'FLOAT', widget: { name: 'max' }, link: null },
            { name: 'step', type: 'FLOAT', widget: { name: 'step' }, link: null },
            { name: 'decimals', type: 'INT', widget: { name: 'decimals' }, link: null },
        ],
        widgets_values: CUSTOM_VALUES,
    });
    const innerShell = baseNode({
        id: 8,
        type: INNER_ID,
        title: 'Inner Float',
        inputs: [
            {
                name: 'value',
                type: 'FLOAT',
                widget: { name: 'value' },
                link: 1,
            },
        ],
        widgets_values: [CUSTOM_VALUES[0]],
    });
    const innerSubgraph: ComfySubgraphDefinition = {
        id: INNER_ID,
        name: 'Inner Float',
        inputs: [
            { name: 'value', type: 'FLOAT', linkIds: [2] },
        ],
        links: [
            {
                id: 2,
                origin_id: -10,
                origin_slot: 0,
                target_id: 7,
                target_slot: 0,
                type: 'FLOAT',
            },
        ],
        nodes: [leaf],
    };
    const outerSubgraph: ComfySubgraphDefinition = {
        id: OUTER_ID,
        name: 'CFG',
        inputs: [
            { name: 'cfg', type: 'FLOAT', linkIds: [1], label: 'cfg' },
        ],
        links: [
            {
                id: 1,
                origin_id: -10,
                origin_slot: 0,
                target_id: 8,
                target_slot: 0,
                type: 'FLOAT',
            },
        ],
        nodes: [innerShell],
    };
    return {
        nodes: [
            baseNode({
                id: 42,
                type: OUTER_ID,
                title: 'CFG',
                inputs: [
                    {
                        name: 'cfg',
                        type: 'FLOAT',
                        label: 'cfg',
                        widget: { name: 'cfg' },
                        link: null,
                    },
                ],
                widgets_values: [CUSTOM_VALUES[0]],
            }),
        ],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
        definitions: { subgraphs: [outerSubgraph, innerSubgraph] },
    };
}

function assertValueConstraints(
    field: { kind: string; value: unknown; options?: {
        min?: number;
        max?: number;
        step?: number;
        precision?: number;
    } } | undefined,
    label: string,
) {
    assert.ok(field, `${label} exists`);
    assert.equal(field.kind, 'number', `${label} kind`);
    assert.equal(field.value, 0.75, `${label} value`);
    assert.equal(field.options?.min, -5, `${label} min, got ${field.options?.min}`);
    assert.equal(field.options?.max, 10, `${label} max, got ${field.options?.max}`);
    assert.equal(field.options?.step, 0.05, `${label} step, got ${field.options?.step}`);
    assert.equal(field.options?.precision, 3, `${label} precision, got ${field.options?.precision}`);
}

const cards = discoverCards(subgraphWorkflow(), svFloatObjectInfo);
assert.equal(cards.length, 1, 'one CFG Scale card');
assert.equal(cards[0].fields.length, 1, 'only value is proxied');
assertValueConstraints(cards[0].fields[0], 'proxied value');

const noInfo = discoverCards(subgraphWorkflow(), null);
assertValueConstraints(noInfo[0].fields[0], 'no object_info value');

const top = discoverCards(topLevelWorkflow(), svFloatObjectInfo);
assert.equal(top.length, 1);
assert.equal(
    top[0].fields.length,
    1,
    `config widgets hidden, got ${top[0].fields.map((f) => f.widgetName).join(',')}`,
);
const value = top[0].fields.find((f) => f.widgetName === 'value');
assertValueConstraints(value, 'top-level value');

const nested = discoverCards(twoDeepWorkflow(), svFloatObjectInfo);
assert.equal(nested.length, 1);
const cfg = nested[0].fields.find((f) => f.widgetName === 'cfg');
assertValueConstraints(cfg, 'two-deep cfg');

console.log('fields.svFloat.test.ts passed');
