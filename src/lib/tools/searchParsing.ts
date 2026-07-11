// Keep in sync with searchKeywords in src/lib/types/misc.ts
const SEARCH_KEYWORD_ENTRIES = [
    'AND',
    'NOT',
    'ALL',
    'NEGATIVE|NEG',
    'FOLDER|FD',
    'PARAMS|PR',
    'DATE|DT',
    'MODEL|MD',
    'ANNOTATION|AN',
    'TAG',
    'SIMILAR|SM',
    'IMG',
    'ID',
    'VIDEO|VID',
    'SKIP',
    'TAKE',
    'MMR',
    'IMGSIM',
] as const;

export type SearchClause = {
    text: string;
    start: number;
    end: number;
};

export type ParsedWeightedImgQueryClause = {
    text: string;
    weight: 1 | -1;
};

function expandClauseKeywordTokens(): string[] {
    const tokens = new Set<string>();
    for (const entry of SEARCH_KEYWORD_ENTRIES) {
        for (const alias of entry.split('|')) {
            tokens.add(alias.toUpperCase());
        }
    }
    return [...tokens].sort((a, b) => b.length - a.length);
}

const CLAUSE_KEYWORD_TOKENS = expandClauseKeywordTokens();
const PREFIX_KEYWORD_TOKENS = new Set(CLAUSE_KEYWORD_TOKENS);

type KeywordMatch = {
    canonical: string;
    length: number;
    escaped: boolean;
};

function skipWhitespace(search: string, index: number): number {
    while (index < search.length && /\s/.test(search[index]))
        index++;
    return index;
}

function readKeywordAt(search: string, index: number): KeywordMatch | null {
    if (index >= search.length)
        return null;

    const escaped = search[index] === '\\';
    const probe = escaped ? index + 1 : index;
    if (probe >= search.length)
        return null;

    const slice = search.slice(probe);
    for (const keyword of CLAUSE_KEYWORD_TOKENS) {
        const match = slice.match(new RegExp(`^${keyword}(?=\\s|$)`, 'i'));
        if (match) {
            return {
                canonical: match[0],
                length: escaped ? 1 + match[0].length : match[0].length,
                escaped,
            };
        }
    }

    if (!escaped) {
        const andMatch = slice.match(/^AND(?=\s|$)/i);
        if (andMatch) {
            return {
                canonical: andMatch[0],
                length: andMatch[0].length,
                escaped: false,
            };
        }
    }

    return null;
}

function isExplicitAndDelimiter(search: string, index: number): boolean {
    return /^\s+AND(?=\s|$)/i.test(search.slice(index));
}

function consumeExplicitAndDelimiter(search: string, index: number): number {
    const match = search.slice(index).match(/^\s+AND\s+/i);
    return index + (match?.[0].length ?? 0);
}

function isPrefixKeyword(canonical: string): boolean {
    return canonical.toUpperCase() === 'AND' || PREFIX_KEYWORD_TOKENS.has(canonical.toUpperCase());
}

function findWordEnd(search: string, index: number): number {
    while (index < search.length && !/\s/.test(search[index]))
        index++;
    return index;
}

function isDateBodyToken(word: string): boolean {
    if (/^TO$/i.test(word))
        return true;
    if (/^-?\d+[ymdh]$/i.test(word))
        return true;
    if (/^-?\d+$/.test(word))
        return true;
    if (/^\d{4}(\.\d{1,2}(\.\d{1,2})?)?$/.test(word))
        return true;
    if (/^\d{1,2}(:\d{2}(:\d{2})?)?$/.test(word))
        return true;
    return false;
}

function findClauseBodyBoundary(
    search: string,
    bodyStart: number,
    hasDatePrefix: boolean,
): { end: number; nextPos: number } {
    if (hasDatePrefix) {
        let index = bodyStart;
        while (index < search.length) {
            if (isExplicitAndDelimiter(search, index))
                return { end: index, nextPos: consumeExplicitAndDelimiter(search, index) };

            index = skipWhitespace(search, index);
            if (index >= search.length)
                return { end: search.length, nextPos: search.length };

            const keyword = readKeywordAt(search, index);
            if (keyword && !keyword.escaped) {
                const upper = keyword.canonical.toUpperCase();
                if (upper === 'AND') {
                    let end = index;
                    while (end > bodyStart && /\s/.test(search[end - 1]))
                        end--;
                    return { end, nextPos: consumeExplicitAndDelimiter(search, index) };
                }
                if (!isDateBodyToken(keyword.canonical)) {
                    let end = index;
                    while (end > bodyStart && /\s/.test(search[end - 1]))
                        end--;
                    return { end, nextPos: index };
                }
            }

            const wordEnd = findWordEnd(search, index);
            const word = search.slice(index, wordEnd);
            if (!isDateBodyToken(word)) {
                let end = index;
                while (end > bodyStart && /\s/.test(search[end - 1]))
                    end--;
                return { end, nextPos: index };
            }

            index = wordEnd;
        }

        return { end: search.length, nextPos: search.length };
    }

    for (let index = bodyStart; index < search.length; index++) {
        if (isExplicitAndDelimiter(search, index))
            return { end: index, nextPos: consumeExplicitAndDelimiter(search, index) };

        if (!/\s/.test(search[index]))
            continue;

        const keywordStart = skipWhitespace(search, index);
        const keyword = readKeywordAt(search, keywordStart);
        if (!keyword || keyword.escaped)
            continue;

        const upper = keyword.canonical.toUpperCase();
        if (upper === 'AND')
            return { end: index, nextPos: consumeExplicitAndDelimiter(search, index) };

        return { end: index, nextPos: keywordStart };
    }

    return { end: search.length, nextPos: search.length };
}

export function unescapeSearchLiterals(text: string): string {
    let result = text;
    for (const keyword of CLAUSE_KEYWORD_TOKENS) {
        result = result.replace(new RegExp(`\\\\${keyword}(?=\\s|$)`, 'gi'), keyword);
    }
    return result.replace(/\\AND(?=\s|$)/gi, 'AND');
}

export function tokenizeSearchClauses(search: string): SearchClause[] {
    if (!search)
        return [];

    const clauses: SearchClause[] = [];
    let pos = 0;

    while (pos < search.length) {
        pos = skipWhitespace(search, pos);
        if (pos >= search.length)
            break;

        const clauseStart = pos;
        let hasDatePrefix = false;

        while (pos < search.length) {
            const keyword = readKeywordAt(search, pos);
            if (!keyword || keyword.escaped || !isPrefixKeyword(keyword.canonical))
                break;

            const upper = keyword.canonical.toUpperCase();
            if (upper === 'DATE' || upper === 'DT')
                hasDatePrefix = true;

            pos += keyword.length;
            pos = skipWhitespace(search, pos);
        }

        let end = search.length;
        let nextPos = search.length;

        const boundary = findClauseBodyBoundary(search, pos, hasDatePrefix);
        end = boundary.end;
        nextPos = boundary.nextPos;

        const text = search.slice(clauseStart, end);
        if (text.trim())
            clauses.push({ text, start: clauseStart, end });

        pos = nextPos;
    }

    return clauses;
}

export function splitSearchParts(search: string): string[] {
    return tokenizeSearchClauses(search)
        .map((clause) => clause.text.trim())
        .filter((part) => part.length > 0);
}

export function parseWeightedImgQueryClauses(queryText: string): ParsedWeightedImgQueryClause[] {
    const clauses: ParsedWeightedImgQueryClause[] = [];
    const separatorRegex = /\s([+-])\s/g;
    let weight: 1 | -1 = 1;
    let start = 0;
    let match: RegExpExecArray | null;

    const addClause = (end: number) => {
        const text = queryText.slice(start, end).trim();
        if (text)
            clauses.push({ text, weight });
    };

    while ((match = separatorRegex.exec(queryText)) !== null) {
        addClause(match.index);
        weight = match[1] === '+' ? 1 : -1;
        start = separatorRegex.lastIndex;
    }

    addClause(queryText.length);
    return clauses;
}

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
    return splitSearchParts(search)
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

export function isNegatedSearchPart(part: string): boolean {
    return notPrefixRegex.test(part.trim());
}

export function getPositiveSimilarSourceIds(search: string): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();

    for (const part of splitSearchParts(search)) {
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
