import assert from 'node:assert/strict';
import { applyIntControlsAfterQueue } from '../src/lib/svgen/intControl.ts';
import type { SvgenCard, SvgenField } from '../src/lib/svgen/types.ts';
import type { ComfyWorkflow } from '../src/lib/types/images.ts';

function seedWorkflow(seed: number): ComfyWorkflow {
    return {
        nodes: [
            {
                id: 1,
                type: 'KSampler',
                title: 'Sampler',
                pos: [0, 0],
                size: [100, 100],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [],
                outputs: [],
                widgets_values: [seed],
                properties: {},
            },
        ],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
    };
}

function seedField(value: number): SvgenField {
    return {
        nodeId: '1',
        nodeType: 'KSampler',
        nodeTitle: 'Sampler',
        widgetName: 'seed',
        label: 'seed',
        kind: 'seed',
        value,
        valueIndex: 0,
        writeMode: 'outer',
        supportsIntControl: true,
        options: { min: 0, max: 100, step: 1 },
    };
}

function seedCards(value: number): SvgenCard[] {
    return [{
        nodeId: '1',
        nodeType: 'KSampler',
        title: 'Sampler',
        fields: [seedField(value)],
    }];
}

function seedOf(workflow: ComfyWorkflow): number {
    const values = workflow.nodes[0]?.widgets_values;
    assert.ok(Array.isArray(values));
    return Number(values[0]);
}

function advance(workflow: ComfyWorkflow): ComfyWorkflow {
    return applyIntControlsAfterQueue(
        workflow,
        seedCards(seedOf(workflow)),
        { '1:seed': 'increment' },
        new Set(),
    );
}

const incremented = advance(seedWorkflow(5));
assert.equal(seedOf(incremented), 6);
assert.equal(seedOf(advance(incremented)), 7);

const frozen = applyIntControlsAfterQueue(
    seedWorkflow(5),
    seedCards(5),
    { '1:seed': 'increment' },
    new Set(['1:seed']),
);
assert.equal(seedOf(frozen), 5, 'frozen keys must not advance');

const fixed = applyIntControlsAfterQueue(
    seedWorkflow(5),
    seedCards(5),
    { '1:seed': 'fixed' },
    new Set(),
);
assert.equal(seedOf(fixed), 5);

type Store = { workflow: ComfyWorkflow };

/** Old queueOnePrompt: snapshot, await convert/submit, then advance. */
async function queueWithLateAdvance(store: Store): Promise<number> {
    const queued = store.workflow;
    await Promise.resolve();
    store.workflow = advance(store.workflow);
    return seedOf(queued);
}

/** Fixed queueOnePrompt: snapshot and advance before any await. */
async function queueWithImmediateAdvance(store: Store): Promise<number> {
    const queued = store.workflow;
    store.workflow = advance(store.workflow);
    await Promise.resolve();
    return seedOf(queued);
}

const lateStore: Store = { workflow: seedWorkflow(5) };
const lateQueued = await Promise.all([
    queueWithLateAdvance(lateStore),
    queueWithLateAdvance(lateStore),
]);
assert.deepEqual(lateQueued, [5, 5], 'late advance is the double-queue race');

const earlyStore: Store = { workflow: seedWorkflow(5) };
const earlyQueued = await Promise.all([
    queueWithImmediateAdvance(earlyStore),
    queueWithImmediateAdvance(earlyStore),
]);
assert.deepEqual(earlyQueued, [5, 6], 'immediate advance claims distinct seeds');
assert.equal(seedOf(earlyStore.workflow), 7);
