function parseThresholdSuffix(value: string): number | undefined {
    const trimmed = value.trim();
    if (!/^-?\d*[.,]?\d+$/.test(trimmed))
        return undefined;

    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed))
        return undefined;

    return parsed;
}

const similarPrefixRegex = /^(?:(?:AND|NOT|ALL|NEGATIVE|NEG|FOLDER|FD|PARAMS|PR|DATE|DT|MODEL|MD|ANNOTATION|AN|TAG|ID|VIDEO|VID|SKIP|TAKE)\s+)*(?:SIMILAR|SM)\s+/i;

export function extractSimilarSearchTarget(rawOrPart: string): string {
    return rawOrPart.trim().replace(similarPrefixRegex, '');
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
