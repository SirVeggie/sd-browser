import { describe, expect, it } from 'vitest';
import {
    executedPreviewNodeIds,
    makeNodePreviewEntry,
    parseExecutedOutputImages,
    parseExecutedOutputText,
} from '../src/lib/svgen/nodePreviews';

describe('parseExecutedOutputImages', () => {
    it('reads filename/subfolder/type from executed payload', () => {
        const refs = parseExecutedOutputImages({
            node: '12',
            display_node: '12',
            output: {
                images: [
                    { filename: 'a.png', subfolder: 'tmp', type: 'temp' },
                    { filename: 'b.png', type: 'output' },
                ],
            },
        });
        expect(refs).toEqual([
            { filename: 'a.png', subfolder: 'tmp', type: 'temp' },
            { filename: 'b.png', subfolder: '', type: 'output' },
        ]);
    });

    it('returns empty for missing or invalid payload', () => {
        expect(parseExecutedOutputImages(null)).toEqual([]);
        expect(parseExecutedOutputImages({ output: {} })).toEqual([]);
        expect(parseExecutedOutputImages({ output: { images: [{ type: 'temp' }] } })).toEqual([]);
    });

    it('defaults unknown folder types to temp', () => {
        const refs = parseExecutedOutputImages({
            output: { images: [{ filename: 'x.png', type: 'weird' }] },
        });
        expect(refs[0]?.type).toBe('temp');
    });
});

describe('executedPreviewNodeIds', () => {
    it('collects node and display_node', () => {
        expect(executedPreviewNodeIds({ node: 5, display_node: '5' })).toEqual(['5']);
        expect(executedPreviewNodeIds({ node: '10', display_node: '9' }).sort()).toEqual(['10', '9']);
    });
});

describe('makeNodePreviewEntry', () => {
    it('builds a cache-busted view path for the first image', () => {
        const entry = makeNodePreviewEntry([
            { filename: 'out.png', subfolder: '', type: 'temp' },
        ]);
        expect(entry).not.toBeNull();
        expect(entry!.path).toContain('/api/svgen/comfy/view?');
        expect(entry!.path).toContain('filename=out.png');
        expect(entry!.path).toContain('type=temp');
        expect(entry!.path).toContain('rand=');
    });
});

describe('parseExecutedOutputText', () => {
    it('joins PreviewText tuple/array payloads', () => {
        expect(parseExecutedOutputText({ output: { text: ['hello\nworld'] } })).toBe('hello\nworld');
        expect(parseExecutedOutputText({ output: { text: ['a', 'b'] } })).toBe('a\n\nb');
        expect(parseExecutedOutputText({ output: { text: 'plain' } })).toBe('plain');
    });

    it('returns null when text is missing', () => {
        expect(parseExecutedOutputText(null)).toBeNull();
        expect(parseExecutedOutputText({ output: {} })).toBeNull();
        expect(parseExecutedOutputText({ output: { images: [] } })).toBeNull();
    });
});
