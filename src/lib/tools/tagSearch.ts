import { searchKeywords } from '$lib/types/misc';
import { isExactTagTerm } from '$lib/types/tags';

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
    const parts = text.split(/\s+AND\s+/i);
    let searchFrom = 0;

    for (const part of parts) {
        const term = extractTagTermFromClause(part);
        if (!term || !isExactTagTerm(term) || registryNames.has(term)) {
            const partIndex = text.indexOf(part, searchFrom);
            searchFrom = partIndex >= 0 ? partIndex + part.length : searchFrom + part.length;
            continue;
        }

        const partIndex = text.indexOf(part, searchFrom);
        if (partIndex < 0)
            continue;

        const termStart = text.indexOf(term, partIndex);
        if (termStart >= 0)
            ranges.push({ start: termStart, end: termStart + term.length });

        searchFrom = partIndex + part.length;
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
