import { tokenizeSearchClauses } from './searchParsing';

const IMAGE_ID_LENGTH = 64;
const ABBREVIATED_ID_LENGTH = 9;
const FULL_HEX_ID_PATTERN = '[0-9a-f]{64}';

const similarClauseRegex = /^(?:NOT\s+)?(?:SIMILAR|SM)\s+/i;
const imgClauseRegex = /^(?:NOT\s+)?IMG\s+/i;
const similarFullIdInClauseRegex = new RegExp(
    `((?:NOT\\s+)?(?:SIMILAR|SM)\\s+)(${FULL_HEX_ID_PATTERN})(?=\\s|$)`,
    'i',
);
const similarAnyIdInClauseRegex = /(?:NOT\s+)?(?:SIMILAR|SM)\s+(\S+)/i;
const fullHexIdTokenRegex = new RegExp(`(?<![0-9a-f])(${FULL_HEX_ID_PATTERN})(?![0-9a-f])`, 'gi');
const abbreviatedIdRegex = /[0-9a-f]{6}\.\.\./gi;
const partialHexIdRegex = /^[0-9a-f]{7,63}$/i;

export type AbbreviatedIdRange = {
    start: number;
    end: number;
    canonicalStart: number;
    canonicalEnd: number;
};

type ClauseIdMatch = {
    start: number;
    id: string;
};

export function abbreviateImageId(id: string): string {
    return `${id.slice(0, 6)}...`;
}

function findAbbreviatableIdsInClause(clauseText: string): ClauseIdMatch[] {
    if (similarClauseRegex.test(clauseText)) {
        const match = clauseText.match(similarFullIdInClauseRegex);
        if (!match || match.index === undefined)
            return [];

        const header = match[1] ?? '';
        const id = match[2] ?? '';
        return [{ start: match.index + header.length, id }];
    }

    if (!imgClauseRegex.test(clauseText))
        return [];

    const headerMatch = clauseText.match(imgClauseRegex);
    const bodyStart = headerMatch?.[0].length ?? 0;
    const body = clauseText.slice(bodyStart);
    const ids: ClauseIdMatch[] = [];

    fullHexIdTokenRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fullHexIdTokenRegex.exec(body)) !== null) {
        const id = match[1] ?? '';
        if (!id)
            continue;
        ids.push({ start: bodyStart + match.index, id });
    }

    return ids;
}

function collectCanonicalIds(canonical: string): string[] {
    const ids: string[] = [];
    for (const clause of tokenizeSearchClauses(canonical)) {
        for (const { id } of findAbbreviatableIdsInClause(clause.text))
            ids.push(id);
    }
    return ids;
}

export function getSearchDisplay(canonical: string): {
    text: string;
    ranges: AbbreviatedIdRange[];
} {
    let text = '';
    let lastEnd = 0;
    const ranges: AbbreviatedIdRange[] = [];

    for (const clause of tokenizeSearchClauses(canonical)) {
        for (const { start, id } of findAbbreviatableIdsInClause(clause.text)) {
            const idStart = clause.start + start;

            text += canonical.slice(lastEnd, idStart);
            const displayStart = text.length;
            text += abbreviateImageId(id);
            ranges.push({
                start: displayStart,
                end: displayStart + ABBREVIATED_ID_LENGTH,
                canonicalStart: idStart,
                canonicalEnd: idStart + IMAGE_ID_LENGTH,
            });
            lastEnd = idStart + IMAGE_ID_LENGTH;
        }
    }

    return {
        text: text + canonical.slice(lastEnd),
        ranges,
    };
}

export function inflateSearchDisplay(display: string, previousCanonical: string): string {
    const ids = collectCanonicalIds(previousCanonical);
    let idIndex = 0;

    return display.replace(abbreviatedIdRegex, (match) => {
        const prefix = match.slice(0, 6).toLowerCase();
        const id = ids.slice(idIndex).find((candidate) => candidate.slice(0, 6).toLowerCase() === prefix);
        if (!id)
            return match;

        idIndex = ids.indexOf(id, idIndex) + 1;
        return id;
    });
}

export function getTouchedAbbreviatedIdRange(args: {
    ranges: AbbreviatedIdRange[];
    selectionStart: number;
    selectionEnd: number;
    inputType: string;
}): AbbreviatedIdRange | undefined {
    return args.ranges.find((range) => {
        if (args.selectionStart !== args.selectionEnd)
            return args.selectionStart < range.end && args.selectionEnd > range.start;

        if (args.inputType === 'deleteContentBackward')
            return args.selectionStart > range.start && args.selectionStart <= range.end;

        if (args.inputType === 'deleteContentForward')
            return args.selectionStart >= range.start && args.selectionStart < range.end;

        return args.selectionStart >= range.start && args.selectionStart <= range.end;
    });
}

export function mapDisplaySelectionToCanonical(
    range: AbbreviatedIdRange,
    selectionStart: number,
    selectionEnd: number,
): { selectionStart: number; selectionEnd: number } {
    return {
        selectionStart: mapDisplayOffsetToCanonical(range, selectionStart),
        selectionEnd: mapDisplayOffsetToCanonical(range, selectionEnd),
    };
}

function mapDisplayOffsetToCanonical(range: AbbreviatedIdRange, offset: number): number {
    if (offset <= range.start)
        return offset;

    const expandedLength = range.canonicalEnd - range.canonicalStart;
    const collapsedLength = range.end - range.start;
    if (offset >= range.end)
        return offset + expandedLength - collapsedLength;

    const relativeOffset = offset - range.start;
    if (relativeOffset <= 6)
        return range.canonicalStart + Math.max(0, relativeOffset);
    return range.canonicalEnd;
}

export function shouldCollapseExpandedSearch(canonical: string): boolean {
    for (const clause of tokenizeSearchClauses(canonical)) {
        if (similarClauseRegex.test(clause.text)) {
            const match = clause.text.match(similarAnyIdInClauseRegex);
            const id = match?.[1];
            if (id && id.length !== IMAGE_ID_LENGTH)
                return false;
            continue;
        }

        if (!imgClauseRegex.test(clause.text))
            continue;

        const headerMatch = clause.text.match(imgClauseRegex);
        const body = clause.text.slice(headerMatch?.[0].length ?? 0);
        for (const token of body.split(/\s+/)) {
            if (partialHexIdRegex.test(token))
                return false;
        }
    }

    return true;
}
