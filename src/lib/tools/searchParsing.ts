function parseThresholdSuffix(value: string): number | undefined {
    const trimmed = value.trim();
    if (!/^-?\d*[.,]?\d+$/.test(trimmed))
        return undefined;

    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed))
        return undefined;

    return parsed;
}

const searchKeywordPrefix = '(?:AND|NOT|ALL|NEGATIVE|NEG|FOLDER|FD|PARAMS|PR|DATE|DT|MODEL|MD|ANNOTATION|AN|TAG|ID|VIDEO|VID|SKIP|TAKE)';
const similarPrefixRegex = new RegExp(`^(?:(?:${searchKeywordPrefix})\\s+)*(?:SIMILAR|SM)\\s+`, 'i');
const imgPrefixRegex = new RegExp(`^(?:(?:${searchKeywordPrefix})\\s+)*IMG(?:\\s+|$)`, 'i');
const notPrefixRegex = new RegExp(`^(?:(?:${searchKeywordPrefix})\\s+)*NOT\\s+`, 'i');
const andSplitRegex = /\s+AND\s+/i;

export function extractSimilarSearchTarget(rawOrPart: string): string {
    return rawOrPart.trim().replace(similarPrefixRegex, '');
}

export function isSimilarSearchPart(part: string): boolean {
    return similarPrefixRegex.test(part.trim());
}

export function isImgSearchPart(part: string): boolean {
    return imgPrefixRegex.test(part.trim());
}

export function hasSimilaritySearchParts(search: string): boolean {
    return search
        .split(andSplitRegex)
        .some((part) => isSimilarSearchPart(part) || isImgSearchPart(part));
}

export function isNegatedSearchPart(part: string): boolean {
    return notPrefixRegex.test(part.trim());
}

export function getPositiveSimilarSourceIds(search: string): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();

    for (const part of search.split(andSplitRegex)) {
        if (!isSimilarSearchPart(part) || isNegatedSearchPart(part))
            continue;

        const { imageId } = parseSimilarSearchTarget(part);
        if (!imageId || seen.has(imageId))
            continue;

        seen.add(imageId);
        ids.push(imageId);
    }

    return ids;
}

export function pinIdsToFront(ids: string[], frontIds: string[]): string[] {
    if (!frontIds.length)
        return ids;

    const seen = new Set<string>();
    const result: string[] = [];

    for (const id of frontIds) {
        if (seen.has(id))
            continue;
        result.push(id);
        seen.add(id);
    }

    for (const id of ids) {
        if (seen.has(id))
            continue;
        result.push(id);
        seen.add(id);
    }

    return result;
}

export function parseSearchTargetWithOptionalThreshold(raw: string): { text: string; threshold?: number } {
    const trimmed = raw.trim();
    if (!trimmed) {
        return { text: '' };
    }

    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace <= 0) {
        return { text: trimmed };
    }

    const threshold = parseThresholdSuffix(trimmed.slice(lastSpace + 1));
    if (threshold === undefined) {
        return { text: trimmed };
    }

    return {
        text: trimmed.slice(0, lastSpace).trim(),
        threshold,
    };
}

export function parseSimilarSearchTarget(raw: string): {
    imageId: string;
    threshold?: number;
    mode: 'prompt' | 'embedding';
} {
    const trimmed = extractSimilarSearchTarget(raw).trim();
    if (/^img(\s|$)/i.test(trimmed)) {
        const withoutImg = trimmed.replace(/^img\s+/i, '').trim();
        const { text, threshold } = parseSearchTargetWithOptionalThreshold(withoutImg);
        return { imageId: text, threshold, mode: 'embedding' };
    }

    const { text, threshold } = parseSearchTargetWithOptionalThreshold(trimmed);
    return { imageId: text, threshold, mode: 'prompt' };
}
