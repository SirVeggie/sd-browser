import assert from 'node:assert/strict';
import { discoverCards } from '../src/lib/svgen/fields.ts';
import type {
    ComfySubgraphDefinition,
    ComfyWorkflow,
    ComfyWorkflowNode,
} from '../src/lib/types/images.ts';
import type { ObjectInfoMap } from '../src/lib/svgen/types.ts';

/**
 * Combo widgets promoted through *two* subgraphs (outer shell → inner shell →
 * concrete combo) must still resolve as combo, not a string. Schema lookup
 * used to stop at the inner subgraph UUID.
 */

const OUTER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const INNER_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

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

function twoDeepWorkflow(opts: {
    leafType: string;
    leafInputs: ComfyWorkflowNode['inputs'];
    leafValues: ComfyWorkflowNode['widgets_values'];
    outerSocketName: string;
    innerSocketName: string;
}): ComfyWorkflow {
    const leaf = baseNode({
        id: 7,
        type: opts.leafType,
        properties: { 'Node name for S&R': opts.leafType },
        inputs: opts.leafInputs,
        widgets_values: opts.leafValues,
    });

    const innerShell = baseNode({
        id: 8,
        type: INNER_ID,
        title: 'Quick Model',
        inputs: [
            {
                name: opts.innerSocketName,
                type: 'COMBO',
                widget: { name: opts.innerSocketName },
                link: 1,
            },
        ],
        widgets_values: [Array.isArray(opts.leafValues) ? opts.leafValues[0] : 'Gemma'],
    });

    const innerSubgraph: ComfySubgraphDefinition = {
        id: INNER_ID,
        name: 'Quick Model',
        inputs: [
            { name: opts.innerSocketName, type: 'COMBO', linkIds: [2] },
        ],
        links: [
            {
                id: 2,
                origin_id: -10,
                origin_slot: 0,
                target_id: 7,
                target_slot: 0,
                type: 'COMBO',
            },
        ],
        nodes: [leaf],
    };

    const outerSubgraph: ComfySubgraphDefinition = {
        id: OUTER_ID,
        name: 'LLM Prompt',
        inputs: [
            { name: opts.outerSocketName, type: 'COMBO', linkIds: [1], label: 'model' },
        ],
        links: [
            {
                id: 1,
                origin_id: -10,
                origin_slot: 0,
                target_id: 8,
                target_slot: 0,
                type: 'COMBO',
            },
        ],
        nodes: [innerShell],
    };

    return {
        nodes: [
            baseNode({
                id: 42,
                type: OUTER_ID,
                title: 'LLM Prompt',
                inputs: [
                    {
                        name: opts.outerSocketName,
                        type: 'COMBO',
                        label: 'model',
                        widget: { name: opts.outerSocketName },
                        link: null,
                    },
                ],
                widgets_values: [Array.isArray(opts.leafValues) ? opts.leafValues[0] : 'Gemma'],
            }),
        ],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
        definitions: { subgraphs: [outerSubgraph, innerSubgraph] },
    };
}

function svComboWorkflow(): ComfyWorkflow {
    return twoDeepWorkflow({
        leafType: 'SV-Combo',
        outerSocketName: 'model',
        innerSocketName: 'choice',
        leafInputs: [
            {
                name: 'choice',
                type: 'COMBO',
                widget: { name: 'choice' },
                link: 2,
            },
            {
                name: 'options',
                type: 'STRING',
                widget: { name: 'options' },
                link: null,
            },
        ],
        leafValues: ['Gemma', 'Gemma, Deepseek'],
    });
}

function customComboWorkflow(): ComfyWorkflow {
    return twoDeepWorkflow({
        leafType: 'CustomCombo',
        outerSocketName: 'choice',
        innerSocketName: 'choice',
        leafInputs: [
            {
                name: 'choice',
                type: 'COMBO',
                widget: { name: 'choice' },
                link: 2,
            },
        ],
        leafValues: ['Gemma', 0, 'Gemma', 'Deepseek', ''],
    });
}

function nativeComboWorkflow(): ComfyWorkflow {
    return twoDeepWorkflow({
        leafType: 'CheckpointLoaderSimple',
        outerSocketName: 'ckpt_name',
        innerSocketName: 'ckpt_name',
        leafInputs: [
            {
                name: 'ckpt_name',
                type: 'COMBO',
                widget: { name: 'ckpt_name' },
                link: 2,
            },
        ],
        leafValues: ['modelA.safetensors'],
    });
}

const nativeObjectInfo: ObjectInfoMap = {
    CheckpointLoaderSimple: {
        display_name: 'Load Checkpoint',
        input: {
            required: {
                ckpt_name: ['COMBO', { options: ['modelA.safetensors', 'modelB.safetensors'] }],
            },
        },
        input_order: { required: ['ckpt_name'] },
    },
};

function assertComboField(
    workflow: ComfyWorkflow,
    objectInfo: ObjectInfoMap | null,
    widgetName: string,
    expectedOptions: string[],
    expectedValue: string,
) {
    const cards = discoverCards(workflow, objectInfo);
    assert.equal(cards.length, 1, 'one outer subgraph card');
    const field = cards[0].fields.find((f) => f.widgetName === widgetName);
    assert.ok(field, `field ${widgetName} exists: ${JSON.stringify(cards[0].fields.map((f) => f.widgetName))}`);
    assert.equal(field.kind, 'combo', `expected combo, got ${field.kind}`);
    assert.deepEqual(
        field.options?.values,
        expectedOptions,
        `combo options mismatch: ${JSON.stringify(field.options?.values)}`,
    );
    assert.equal(field.value, expectedValue);
}

assertComboField(
    svComboWorkflow(),
    null,
    'model',
    ['Gemma', 'Deepseek'],
    'Gemma',
);

assertComboField(
    customComboWorkflow(),
    null,
    'choice',
    ['Gemma', 'Deepseek'],
    'Gemma',
);

assertComboField(
    nativeComboWorkflow(),
    nativeObjectInfo,
    'ckpt_name',
    ['modelA.safetensors', 'modelB.safetensors'],
    'modelA.safetensors',
);

console.log('fields.nestedCombo.test.ts passed');
