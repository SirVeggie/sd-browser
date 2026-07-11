import { searchKeywords } from '$lib/types/misc';
import { isExactTagTerm } from '$lib/types/tags';
import { tokenizeSearchClauses } from './searchParsing';

const keywordPattern = `((${searchKeywords.join('|')}) )*`;
const removeRegex = new RegExp(`^${keywordPattern}`, 'i');
const tagRegex = new RegExp(`^${keywordPattern}TAG `, 'i');

export function extractTagTermFromClause(clause: string): string | undefined {
    const trimmed = clause.trim();
    if (!tagRegex.test(trimmed))
        return undefined;

    const term = trimmed.replace(removeRegex, '').trim();
    return term || undefined;
}

export function getUnknownExactTagRanges(text: string, registryNames: Set<string>): { start: number; end: number }[] {
    if (!text || !registryNames)
        return [];

    const ranges: { start: number; end: number }[] = [];

    for (const clause of tokenizeSearchClauses(text)) {
        const part = clause.text;
        const term = extractTagTermFromClause(part);
        if (!term || !isExactTagTerm(term) || registryNames.has(term))
            continue;

        const termStart = text.indexOf(term, clause.start);
        if (termStart >= 0)
            ranges.push({ start: termStart, end: termStart + term.length });
    }

    return ranges;
}

export function segmentOverlapsRange(
    segmentStart: number,
    segmentEnd: number,
    ranges: { start: number; end: number }[],
): boolean {
    return ranges.some((range) => segmentStart < range.end && segmentEnd > range.start);
}
