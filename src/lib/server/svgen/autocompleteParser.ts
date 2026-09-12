export type ParsedAutocompleteItem = {
    value: string;
    aliases: string[];
    info: string;
    score?: number;
};

const DANBOORU_CATEGORIES: Record<string, string> = {
    '0': 'general',
    '1': 'artist',
    '3': 'copyright',
    '4': 'character',
    '5': 'meta',
};

function numericScore(value: unknown): number | undefined {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string' || !value.trim())
        return undefined;
    const count = Number(value.trim());
    return Number.isFinite(count) ? count : undefined;
}

function inferredScore(record: Record<string, unknown>): number | undefined {
    return numericScore(record.score)
        ?? numericScore(record.post_count)
        ?? numericScore(record.count);
}

function compactCount(value: unknown): string {
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0)
        return '';
    if (count >= 1_000_000)
        return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (count >= 1_000)
        return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(Math.round(count));
}

function categoryName(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number')
        return '';
    const raw = String(value).trim();
    return DANBOORU_CATEGORIES[raw] ?? raw;
}

function inferredInfo(record: Record<string, unknown>): string {
    if (typeof record.info === 'string')
        return record.info.trim();
    const category = categoryName(record.category);
    const count = compactCount(record.post_count ?? record.count);
    return [category, count].filter(Boolean).join(' · ');
}

function stringArray(value: unknown): string[] {
    if (typeof value === 'string')
        return value.trim() ? [value.trim()] : [];
    if (!Array.isArray(value))
        return [];
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
}

function toGenerationBooruTag(value: string): string {
    return value
        .replaceAll('_', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replaceAll('(', '\\(')
        .replaceAll(')', '\\)');
}

function isBooruRecord(record: Record<string, unknown>): boolean {
    if (record.post_count != null)
        return true;
    const category = String(record.category ?? '').trim();
    return Boolean(DANBOORU_CATEGORIES[category]);
}

function applyBooruGenerationValue(item: ParsedAutocompleteItem): ParsedAutocompleteItem {
    const value = toGenerationBooruTag(item.value);
    if (value === item.value)
        return item;
    return {
        ...item,
        value,
        aliases: [
            ...new Set([
                item.value,
                ...item.aliases.filter((alias) => alias !== value),
            ]),
        ],
    };
}

function recordItem(value: unknown): ParsedAutocompleteItem | null {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? { value: trimmed, aliases: [], info: '' } : null;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;

    const record = value as Record<string, unknown>;
    const itemValue = [record.value, record.item, record.name, record.tag]
        .find((candidate): candidate is string => typeof candidate === 'string')
        ?.trim();
    if (!itemValue)
        return null;

    const score = inferredScore(record);
    const item: ParsedAutocompleteItem = {
        value: itemValue,
        aliases: stringArray(record.aliases ?? record.alias),
        info: inferredInfo(record),
        ...(score != null ? { score } : {}),
    };
    return isBooruRecord(record) ? applyBooruGenerationValue(item) : item;
}

export function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index]!;
        if (char === '"') {
            if (quoted && line[index + 1] === '"') {
                field += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
            continue;
        }
        if (char === ',' && !quoted) {
            fields.push(field.trim());
            field = '';
            continue;
        }
        field += char;
    }
    fields.push(field.trim());
    return fields;
}

function parseTextLines(content: string): ParsedAutocompleteItem[] {
    const result: ParsedAutocompleteItem[] = [];
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line)
            continue;
        const fields = parseCsvLine(line);
        const value = fields[0]?.trim();
        if (!value)
            continue;

        const looksLikeA1111 = fields.length >= 3
            && /^[01345]$/.test(fields[1] ?? '')
            && /^\d+$/.test(fields[2] ?? '');
        if (looksLikeA1111) {
            result.push(applyBooruGenerationValue({
                value,
                aliases: fields[3]
                    ? fields[3].split(',').map((alias) => alias.trim()).filter(Boolean)
                    : [],
                info: [
                    categoryName(fields[1]),
                    compactCount(fields[2]),
                ].filter(Boolean).join(' · '),
                score: numericScore(fields[2]),
            }));
            continue;
        }

        result.push({
            value,
            info: fields[1]?.trim() ?? '',
            aliases: fields.slice(2).map((alias) => alias.trim()).filter(Boolean),
        });
    }
    return result;
}

function dedupeItems(items: ParsedAutocompleteItem[]): ParsedAutocompleteItem[] {
    const byValue = new Map<string, ParsedAutocompleteItem>();
    for (const item of items) {
        const key = item.value;
        const existing = byValue.get(key);
        if (!existing) {
            byValue.set(key, {
                value: item.value,
                info: item.info,
                aliases: [...new Set(item.aliases.filter((alias) => alias !== item.value))],
                ...(item.score != null ? { score: item.score } : {}),
            });
            continue;
        }
        existing.aliases = [
            ...new Set([
                ...existing.aliases,
                ...item.aliases.filter((alias) => alias !== existing.value),
            ]),
        ];
        if (!existing.info && item.info)
            existing.info = item.info;
        if (item.score != null && (existing.score == null || item.score > existing.score))
            existing.score = item.score;
    }
    return [...byValue.values()];
}

export function parseAutocompleteSource(content: string): ParsedAutocompleteItem[] {
    const trimmed = content.trim();
    if (!trimmed)
        return [];

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed) as unknown;
        const values = Array.isArray(parsed)
            ? parsed
            : parsed && typeof parsed === 'object'
                ? Object.entries(parsed as Record<string, unknown>).map(([key, value]) => {
                    if (value && typeof value === 'object' && !Array.isArray(value))
                        return { value: key, ...(value as Record<string, unknown>) };
                    return key;
                })
                : [];
        return dedupeItems(
            values
                .map(recordItem)
                .filter((item): item is ParsedAutocompleteItem => item !== null),
        );
    }

    return dedupeItems(parseTextLines(content));
}
