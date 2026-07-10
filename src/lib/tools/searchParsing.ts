function parseThresholdSuffix(value: string): number | undefined {
    const trimmed = value.trim();
    if (!/^-?\d*[.,]?\d+$/.test(trimmed))
        return undefined;

    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed))
        return undefined;

    return parsed;
}

const searchKeywordPrefix = '(?:AND|NOT|ALL|NEGATIVE|NEG|FOLDER|FD|PARAMS|PR|DATE|DT|MODEL|MD|ANNOTATION|AN|TAG|ID|VIDEO|VID|SKIP|TAKE|MMR|IMGSIM)';
const similarPrefixRegex = new RegExp(`^(?:(?:${searchKeywordPrefix})\\s+)*(?:SIMILAR|SM)\\s+`, 'i');
const imgPrefixRegex = new RegExp(`^(?:(?:${searchKeywordPrefix})\\s+)*IMG(?:\\s+|$)`, 'i');
const notPrefixRegex = new RegExp(`^(?:(?:${searchKeywordPrefix})\\s+)*NOT\\s+`, 'i');
const andSplitRegex = /\s+AND\s+/i;
const MMR_DEFAULT_CANDIDATE_MULTIPLIER = 10;
const MMR_MAX_RESULT_COUNT = 5000;
const MMR_MAX_CANDIDATE_COUNT = 50_000;

export type ParsedMmrDirective = {
    resultCount: number;
    candidateCount: number;
};

function resolveMmrCandidateCount(resultCount: number, explicit?: number): number {
    const candidateCount = explicit ?? resultCount * MMR_DEFAULT_CANDIDATE_MULTIPLIER;
    return Math.min(Math.max(1, candidateCount), MMR_MAX_CANDIDATE_COUNT);
}
const mmrPrefixRegex = new RegExp(`^(?:(?:${searchKeywordPrefix})\\s+)*MMR\\s+`, 'i');
const mmrOnlyRegex = new RegExp(`^(?:(?:${searchKeywordPrefix})\\s+)*MMR$`, 'i');
const imgsimPrefixRegex = new RegExp(`^(?:(?:${searchKeywordPrefix})\\s+)*IMGSIM\\s+`, 'i');
const imgsimOnlyRegex = new RegExp(`^(?:(?:${searchKeywordPrefix})\\s+)*IMGSIM$`, 'i');
export const IMGSIM_MAX_RESULT_COUNT = 50_000;

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

export function isMmrSearchPart(part: string): boolean {
    const trimmed = part.trim();
    return mmrPrefixRegex.test(trimmed) || mmrOnlyRegex.test(trimmed);
}

export function hasMmrSearchParts(search: string): boolean {
    return splitSearchParts(search).some((part) => isMmrSearchPart(part) && !isNegatedSearchPart(part));
}

function parsePositiveInteger(value: string): number | undefined {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed))
        return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return undefined;
    return parsed;
}

export function parseMmrDirective(search: string): ParsedMmrDirective | undefined {
    for (const part of splitSearchParts(search)) {
        if (!isMmrSearchPart(part) || isNegatedSearchPart(part))
            continue;

        const raw = part.replace(mmrPrefixRegex, '').trim();
        if (!raw)
            throw new Error('MMR requires a result count');

        const tokens = raw.split(/\s+/).filter(Boolean);
        if (!tokens.length)
            throw new Error('MMR requires a result count');

        const resultCount = parsePositiveInteger(tokens[0]);
        if (resultCount === undefined)
            throw new Error('MMR result count must be a positive integer');

        if (resultCount > MMR_MAX_RESULT_COUNT)
            throw new Error(`MMR result count cannot exceed ${MMR_MAX_RESULT_COUNT}`);

        let explicitCandidateCount: number | undefined;
        if (tokens.length > 1) {
            explicitCandidateCount = parsePositiveInteger(tokens[1]);
            if (explicitCandidateCount === undefined)
                throw new Error('MMR candidate count must be a positive integer');
            if (explicitCandidateCount > MMR_MAX_CANDIDATE_COUNT)
                throw new Error(`MMR candidate count cannot exceed ${MMR_MAX_CANDIDATE_COUNT}`);
        }

        if (tokens.length > 2)
            throw new Error('MMR accepts at most two numbers: result count and optional candidate count');

        const candidateCount = resolveMmrCandidateCount(resultCount, explicitCandidateCount);
        if (candidateCount < resultCount)
            throw new Error('MMR candidate count must be at least the result count');

        return { resultCount, candidateCount };
    }

    return undefined;
}

export type ParsedImgSimDirective = {
    resultCount: number;
};

export function isImgSimSearchPart(part: string): boolean {
    const trimmed = part.trim();
    return imgsimPrefixRegex.test(trimmed) || imgsimOnlyRegex.test(trimmed);
}

export function hasImgSimSearchParts(search: string): boolean {
    return splitSearchParts(search).some((part) => isImgSimSearchPart(part) && !isNegatedSearchPart(part));
}

export function parseImgSimDirective(search: string): ParsedImgSimDirective | undefined {
    for (const part of splitSearchParts(search)) {
        if (!isImgSimSearchPart(part) || isNegatedSearchPart(part))
            continue;

        const raw = part.replace(imgsimPrefixRegex, '').trim();
        if (!raw)
            throw new Error('IMGSIM requires a result count');

        const tokens = raw.split(/\s+/).filter(Boolean);
        if (!tokens.length)
            throw new Error('IMGSIM requires a result count');

        const resultCount = parsePositiveInteger(tokens[0]);
        if (resultCount === undefined)
            throw new Error('IMGSIM result count must be a positive integer');

        if (resultCount > IMGSIM_MAX_RESULT_COUNT)
            throw new Error(`IMGSIM result count cannot exceed ${IMGSIM_MAX_RESULT_COUNT}`);

        if (tokens.length > 1)
            throw new Error('IMGSIM accepts only one number: the remaining result count');

        return { resultCount };
    }

    return undefined;
}

export function stripResultShapingParts(search: string): string {
    return splitSearchParts(search)
        .filter((part) => !isMmrSearchPart(part) && !isImgSimSearchPart(part))
        .join(' AND ');
}

export function stripMmrParts(search: string): string {
    return stripResultShapingParts(search);
}

function splitSearchParts(search: string): string[] {
    return search.split(andSplitRegex);
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
