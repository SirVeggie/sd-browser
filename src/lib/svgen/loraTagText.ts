/**
 * Parse / serialize LoRA prompt tags for SV-LoraTagLoader.
 *
 * Enabled:  `<lora:name:strength>` or `<lora:name:model:clip>`
 * Disabled: `<#lora:name:strength>` (same shapes; `#` after `<` so Comfy's
 *           `<l\w+:…>` matcher skips them while we keep strength data)
 */

export type LoraTagRow = {
    /** Stable id for SortableList; regenerated on parse. */
    id: string;
    enabled: boolean;
    /** Tag family (`lora`, `lyco`, …). */
    tagType: string;
    name: string;
    strength: number;
    clipStrength: number;
};

export type ParsedLoraTagText = {
    rows: LoraTagRow[];
    /** Non-tag remainder of the original string (prompt text, etc.). */
    rest: string;
};

const TAG_RE = /<#?(l\w+):([^>]+)>/gi;

let nextRowId = 0;

function makeRowId(): string {
    nextRowId += 1;
    return `lora-${nextRowId}`;
}

function parseTagBody(body: string): {
    name: string;
    strength: number;
    clipStrength: number;
} | null {
    const parts = body.split(':');
    if (!parts.length)
        return null;
    const name = parts[0]?.trim() ?? '';
    if (!name)
        return null;

    let strength = 1;
    let clipStrength = 1;
    try {
        if (parts.length > 1 && parts[1].trim() !== '') {
            strength = Number(parts[1]);
            clipStrength = strength;
        }
        if (parts.length > 2 && parts[2].trim() !== '')
            clipStrength = Number(parts[2]);
    } catch {
        return null;
    }
    if (!Number.isFinite(strength) || !Number.isFinite(clipStrength))
        return null;
    return { name, strength, clipStrength };
}

/** Keep non-tag prompt text; drop whitespace-only gaps between tags. */
function appendRest(rest: string, chunk: string): string {
    if (!chunk.trim())
        return rest;
    return rest + chunk;
}

/** Extract LoRA/lyco tags (enabled + disabled) and leftover text. */
export function parseLoraTagText(text: string): ParsedLoraTagText {
    const rows: LoraTagRow[] = [];
    let rest = '';
    let last = 0;
    const source = text ?? '';
    TAG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAG_RE.exec(source)) !== null) {
        rest = appendRest(rest, source.slice(last, match.index));
        last = match.index + match[0].length;
        const full = match[0];
        const tagType = match[1] ?? 'lora';
        const body = match[2] ?? '';
        const parsed = parseTagBody(body);
        if (!parsed)
            continue;
        rows.push({
            id: makeRowId(),
            enabled: !full.startsWith('<#'),
            tagType,
            name: parsed.name,
            strength: parsed.strength,
            clipStrength: parsed.clipStrength,
        });
    }
    rest = appendRest(rest, source.slice(last));
    return { rows, rest };
}

export type SerializeLoraTagOptions = {
    /** When true, emit `:clip` even when it equals model strength. */
    includeClip: boolean;
};

function formatTag(row: LoraTagRow, includeClip: boolean): string {
    const type = row.tagType.trim() || 'lora';
    const name = row.name.trim();
    const strength = Number.isFinite(row.strength) ? row.strength : 1;
    const clip = Number.isFinite(row.clipStrength) ? row.clipStrength : strength;
    const body = includeClip
        ? `${name}:${strength}:${clip}`
        : `${name}:${strength}`;
    return row.enabled ? `<${type}:${body}>` : `<#${type}:${body}>`;
}

/** Join rows back into a widgets_values string, preserving non-tag remainder. */
export function serializeLoraTagText(
    rows: readonly LoraTagRow[],
    rest = '',
    options: SerializeLoraTagOptions = { includeClip: false },
): string {
    // One tag per line — easier to read in image / workflow metadata.
    const tags = rows.map((row) => formatTag(row, options.includeClip)).join('\n');
    const leftover = rest.trim();
    if (!leftover)
        return tags;
    if (!tags)
        return leftover;
    return `${tags}\n${leftover}`;
}

export function createEmptyLoraRow(name = ''): LoraTagRow {
    return {
        id: makeRowId(),
        enabled: true,
        tagType: 'lora',
        name,
        strength: 1,
        clipStrength: 1,
    };
}

/**
 * Serialization for queue/convert when the card master switch is off.
 * Does not change stored per-row enable state in the session — only the
 * workflow copy used for the prompt.
 */
export function forceDisableLoraTagsInText(
    text: string,
    includeClip: boolean,
): string {
    const parsed = parseLoraTagText(text);
    if (!parsed.rows.length || !parsed.rows.some((row) => row.enabled))
        return text;
    return serializeLoraTagText(
        parsed.rows.map((row) => (row.enabled ? { ...row, enabled: false } : row)),
        parsed.rest,
        { includeClip },
    );
}
