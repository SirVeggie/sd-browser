const IMAGE_ID_LENGTH = 64;
const ABBREVIATED_ID_LENGTH = 9;
const similarFullIdRegex = /(^|\s+AND\s+)((?:NOT\s+)?(?:SIMILAR|SM)\s+(?:img\s+)?)([0-9a-f]{64})(?=\s|$)/gi;
const similarAbbreviatedIdRegex = /(^|\s+AND\s+)((?:NOT\s+)?(?:SIMILAR|SM)\s+(?:img\s+)?)([0-9a-f]{6}\.\.\.)(?=\s|$)/gi;
const similarAnyIdRegex = /(^|\s+AND\s+)(?:NOT\s+)?(?:SIMILAR|SM)\s+(?:img\s+)?(\S+)/gi;

export type AbbreviatedIdRange = {
    start: number;
    end: number;
    canonicalStart: number;
    canonicalEnd: number;
};

export function abbreviateImageId(id: string): string {
    return `${id.slice(0, 6)}...`;
}

export function getSearchDisplay(canonical: string): {
    text: string;
    ranges: AbbreviatedIdRange[];
} {
    let text = '';
    let lastEnd = 0;
    const ranges: AbbreviatedIdRange[] = [];

    for (const match of canonical.matchAll(similarFullIdRegex)) {
        const leading = match[1] ?? '';
        const header = match[2] ?? '';
        const id = match[3] ?? '';
        const matchStart = match.index ?? 0;
        const idStart = matchStart + leading.length + header.length;

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

    return {
        text: text + canonical.slice(lastEnd),
        ranges,
    };
}

export function inflateSearchDisplay(display: string, previousCanonical: string): string {
    const ids = [...previousCanonical.matchAll(similarFullIdRegex)]
        .map(match => match[3])
        .filter((id): id is string => Boolean(id));

    let idIndex = 0;
    return display.replace(similarAbbreviatedIdRegex, (match, leading, header, abbreviated) => {
        const prefix = abbreviated.slice(0, 6).toLowerCase();
        const id = ids.slice(idIndex).find((candidate) => candidate.slice(0, 6).toLowerCase() === prefix);
        if (id)
            idIndex = ids.indexOf(id, idIndex) + 1;
        return id ? `${leading}${header}${id}` : match;
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
    for (const match of canonical.matchAll(similarAnyIdRegex)) {
        const id = match[2];
        if (id && id.length !== IMAGE_ID_LENGTH)
            return false;
    }
    return true;
}
