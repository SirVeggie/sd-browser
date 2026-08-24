const LORA_EXTS = ['.safetensors', '.pt', '.ckpt', '.bin', '.sft'] as const;

export type LoraTriggerMap = Record<string, string[]>;

function normPath(name: string): string {
    return name.replace(/\\/g, '/').trim();
}

function stripLoraExt(path: string): string {
    const normalized = normPath(path);
    const lower = normalized.toLowerCase();
    for (const ext of LORA_EXTS) {
        if (lower.endsWith(ext))
            return normalized.slice(0, normalized.length - ext.length);
    }
    return normalized;
}

function basename(path: string): string {
    const normalized = normPath(path);
    const slash = normalized.lastIndexOf('/');
    return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function isExactName(query: string, candidate: string): boolean {
    const q = normPath(query);
    const c = normPath(candidate);
    if (!q || !c)
        return false;
    return q.toLowerCase() === c.toLowerCase()
        || stripLoraExt(q).toLowerCase() === stripLoraExt(c).toLowerCase();
}

/** Same prefix rules as SV-LoraTagLoader / lora_resolve.resolve_lora_file. */
function isPrefixName(query: string, candidate: string): boolean {
    const q = normPath(query);
    const c = normPath(candidate);
    if (!q || !c)
        return false;
    const qKey = stripLoraExt(q);
    const cKey = stripLoraExt(c);
    const ql = q.toLowerCase();
    const qkl = qKey.toLowerCase();
    return basename(c).toLowerCase().startsWith(ql)
        || c.toLowerCase().startsWith(ql)
        || basename(cKey).toLowerCase().startsWith(qkl)
        || cKey.toLowerCase().startsWith(qkl);
}

/**
 * Look up trigger words for a card row name (may be a partial).
 * Exact path/stem first, then prefix in either direction so partial keys
 * still match resolved filenames and vice versa.
 */
export function triggersForLoraName(name: string, map: LoraTriggerMap): string[] {
    const keys = Object.keys(map);
    for (const key of keys) {
        if (isExactName(name, key))
            return map[key] ?? [];
    }
    for (const key of keys) {
        if (isPrefixName(name, key) || isPrefixName(key, name))
            return map[key] ?? [];
    }
    return [];
}

export function uniqueLoraNames(names: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of names) {
        const trimmed = name.trim();
        if (!trimmed || seen.has(trimmed))
            continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}

export function parseLoraTriggerMap(body: unknown): LoraTriggerMap {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        return {};
    const out: LoraTriggerMap = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (!Array.isArray(value))
            continue;
        out[key] = value.filter((item): item is string => typeof item === 'string');
    }
    return out;
}
