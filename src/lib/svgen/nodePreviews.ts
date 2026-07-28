import type { ComfyFolderType } from './comfyImageUrls';
import { buildComfyViewPathFromRef } from './comfyImageUrls';

export type ComfyOutputImageRef = {
    filename: string;
    subfolder: string;
    type: ComfyFolderType;
};

export type NodePreviewEntry = {
    images: ComfyOutputImageRef[];
    /** First-image view path with cache-bust baked in at `executed` time. */
    path: string;
};

/** Parse `executed` WS payload → image refs (same shape as Comfy `/view`). */
export function parseExecutedOutputImages(data: unknown): ComfyOutputImageRef[] {
    if (!data || typeof data !== 'object')
        return [];
    const output = (data as { output?: unknown }).output;
    if (!output || typeof output !== 'object')
        return [];
    const images = (output as { images?: unknown }).images;
    if (!Array.isArray(images))
        return [];

    const refs: ComfyOutputImageRef[] = [];
    for (const image of images) {
        if (!image || typeof image !== 'object')
            continue;
        const rec = image as Record<string, unknown>;
        const filename = rec.filename == null ? '' : String(rec.filename).trim();
        if (!filename)
            continue;
        const typeRaw = rec.type == null ? 'temp' : String(rec.type).toLowerCase();
        const type: ComfyFolderType =
            typeRaw === 'input' || typeRaw === 'output' || typeRaw === 'temp'
                ? typeRaw
                : 'temp';
        refs.push({
            filename,
            subfolder: rec.subfolder == null ? '' : String(rec.subfolder),
            type,
        });
    }
    return refs;
}

/** Node ids to update for an `executed` event (`node` + `display_node`). */
export function executedPreviewNodeIds(data: unknown): string[] {
    if (!data || typeof data !== 'object')
        return [];
    const rec = data as { node?: unknown; display_node?: unknown };
    const ids = new Set<string>();
    if (rec.node != null && String(rec.node))
        ids.add(String(rec.node));
    if (rec.display_node != null && String(rec.display_node))
        ids.add(String(rec.display_node));
    return [...ids];
}

export function makeNodePreviewEntry(images: ComfyOutputImageRef[]): NodePreviewEntry | null {
    if (!images.length)
        return null;
    const path = buildComfyViewPathFromRef(images[0]!, { cacheBust: true });
    if (!path)
        return null;
    return { images, path };
}

/**
 * Parse `executed` WS payload → preview text (PreviewText / SV-PreviewText).
 * Comfy serializes `ui.PreviewText` as `{ text: [value] }` (tuple → array).
 */
export function parseExecutedOutputText(data: unknown): string | null {
    if (!data || typeof data !== 'object')
        return null;
    const output = (data as { output?: unknown }).output;
    if (!output || typeof output !== 'object')
        return null;
    const text = (output as { text?: unknown }).text;
    if (text == null)
        return null;
    if (Array.isArray(text))
        return text.map((part) => String(part ?? '')).join('\n\n');
    return String(text);
}
