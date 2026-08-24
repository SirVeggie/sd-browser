import assert from 'node:assert/strict';
import { discoverCards } from '../src/lib/svgen/fields.ts';
import type { ComfyWorkflow } from '../src/lib/types/images.ts';
import type { ObjectInfoMap } from '../src/lib/svgen/types.ts';

const subgraphId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const objectInfo: ObjectInfoMap = {
    'SV-SdBrowserImage': {
        display_name: 'SD Browser Image',
        input: {
            required: {
                image_id: ['STRING', {}],
                search: ['STRING', {}],
                random: ['BOOLEAN', {}],
            },
        },
    },
    PreviewImage: {
        display_name: 'Preview Image',
        input: { required: {} },
    },
};

function sdBrowserWithCanvas(opts: {
    /** Outer socket name for the canvas proxy (may differ from $$canvas…). */
    canvasOuterName: string;
    promoteImageId: boolean;
}): ComfyWorkflow {
    const proxies: [string, string][] = opts.promoteImageId
        ? [['10', 'image_id'], ['10', '$$canvas-image-preview']]
        : [['10', '$$canvas-image-preview']];
    const inputs = [];
    if (opts.promoteImageId) {
        inputs.push({
            name: 'image_id',
            type: 'STRING',
            widget: { name: 'image_id' },
            link: null as number | null,
        });
    }
    inputs.push({
        name: opts.canvasOuterName,
        type: 'IMAGE',
        widget: { name: opts.canvasOuterName },
        link: null as number | null,
        // Title-match trap: outer labeled like the inner node title so Pass 1
        // can remap the canvas proxy onto a non-$$canvas outer name.
        label: opts.canvasOuterName === '$$canvas-image-preview' ? undefined : 'SD Browser',
    });

    return {
        nodes: [{
            id: 1,
            type: subgraphId,
            title: 'SD Browser Sub',
            pos: [0, 0],
            size: [200, 100],
            flags: {},
            order: 0,
            mode: 0,
            inputs,
            outputs: [],
            properties: { proxyWidgets: proxies },
            widgets_values: opts.promoteImageId ? ['abc123', 'preview.png'] : ['preview.png'],
        }],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
        definitions: {
            subgraphs: [{
                id: subgraphId,
                name: 'SD Browser Sub',
                nodes: [{
                    id: 10,
                    type: 'SV-SdBrowserImage',
                    title: 'SD Browser',
                    pos: [0, 0],
                    size: [100, 100],
                    flags: {},
                    order: 0,
                    mode: 0,
                    inputs: [
                        {
                            name: 'image_id',
                            type: 'STRING',
                            widget: { name: 'image_id' },
                            link: null,
                        },
                    ],
                    outputs: [],
                    properties: { 'Node name for S&R': 'SV-SdBrowserImage' },
                    widgets_values: ['abc123'],
                }],
            }],
        },
    };
}

// Canvas remapped onto a non-$$canvas outer name must still be hidden.
{
    const cards = discoverCards(
        sdBrowserWithCanvas({ canvasOuterName: 'preview_slot', promoteImageId: true }),
        objectInfo,
    );
    assert.equal(cards.length, 1);
    const names = cards[0].fields.map((f) => f.widgetName);
    const labels = cards[0].fields.map((f) => f.label);
    assert.ok(!names.some((n) => n.includes('canvas')), `canvas name leaked: ${names}`);
    assert.ok(!labels.some((l) => l.includes('canvas')), `canvas label leaked: ${labels}`);
    assert.equal(cards[0].fields.some((f) => f.kind === 'sd_browser_image'), true);
    assert.equal(cards[0].imageDisplay, false, 'picker already shows preview');
}

// Canvas-only promotion → imageDisplay card, no string field.
{
    const cards = discoverCards(
        sdBrowserWithCanvas({ canvasOuterName: '$$canvas-image-preview', promoteImageId: false }),
        objectInfo,
    );
    assert.equal(cards.length, 1, 'canvas-only subgraph should keep a preview card');
    assert.equal(cards[0].imageDisplay, true);
    assert.equal(cards[0].fields.length, 0);
}

// PreviewImage inside subgraph with only canvas promoted.
{
    const wf: ComfyWorkflow = {
        nodes: [{
            id: 2,
            type: subgraphId,
            title: 'Preview Shell',
            pos: [0, 0],
            size: [200, 100],
            flags: {},
            order: 0,
            mode: 0,
            inputs: [{
                name: '$$canvas-image-preview',
                type: 'IMAGE',
                widget: { name: '$$canvas-image-preview' },
                link: null,
            }],
            outputs: [],
            properties: { proxyWidgets: [['5', '$$canvas-image-preview']] },
            widgets_values: [],
        }],
        links: [],
        groups: [],
        config: {},
        version: 0.4,
        definitions: {
            subgraphs: [{
                id: subgraphId,
                name: 'Preview Shell',
                nodes: [{
                    id: 5,
                    type: 'PreviewImage',
                    title: '',
                    pos: [0, 0],
                    size: [100, 100],
                    flags: {},
                    order: 0,
                    mode: 0,
                    inputs: [{ name: 'images', type: 'IMAGE', link: 1 }],
                    outputs: [],
                    properties: { 'Node name for S&R': 'PreviewImage' },
                    widgets_values: [],
                }],
            }],
        },
    };
    const cards = discoverCards(wf, objectInfo);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].imageDisplay, true);
    assert.equal(cards[0].fields.length, 0);
}

console.log('fields.canvasPreview.test.ts passed');
