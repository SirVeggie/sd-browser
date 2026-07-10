import { searchKeywords } from '../types/searchKeywords';
import { parseSearchTargetWithOptionalThreshold, parseSimilarSearchTarget } from './searchParsing';

const keywordPattern = `(?:(${searchKeywords.join('|')}) )*`;
const similarRegex = new RegExp(`^${keywordPattern}(SIMILAR|SM) `, 'i');
const similarHeaderRegex = new RegExp(`^(${keywordPattern}(SIMILAR|SM)\\s+)`, 'i');
const andSplitRegex = /\s+AND\s+/i;

function extractSimilarPayload(clause: string): string | undefined {
    const trimmed = clause.trim();
    if (!similarRegex.test(trimmed))
        return undefined;

    const headerMatch = trimmed.match(new RegExp(`^${keywordPattern}(SIMILAR|SM)\\s+`, 'i'));
    if (!headerMatch)
        return undefined;

    const payload = trimmed.slice(headerMatch[0].length).trim();
    return payload || undefined;
}

function extractSimilarHeader(clause: string): string {
    const trimmed = clause.trim();
    const match = trimmed.match(similarHeaderRegex);
    return match?.[1] ?? 'SIMILAR ';
}

export const IMAGE_ID_LENGTH = 64;
export const IMAGE_ID_ABBREV_PREFIX_LENGTH = 6;
export const IMAGE_ID_ABBREV_SUFFIX = '...';

export type SimilarIdSpan = {
    idStart: number;
    idEnd: number;
    fullId: string;
};

type DisplaySegment =
    | { kind: 'text'; text: string }
    | { kind: 'id'; span: SimilarIdSpan; text: string };

export function abbreviateImageId(id: string): string {
    if (!shouldAbbreviateImageId(id))
        return id;

    return `${id.slice(0, IMAGE_ID_ABBREV_PREFIX_LENGTH)}${IMAGE_ID_ABBREV_SUFFIX}`;
}

export function shouldAbbreviateImageId(id: string): boolean {
    return id.length > IMAGE_ID_ABBREV_PREFIX_LENGTH + IMAGE_ID_ABBREV_SUFFIX.length;
}

export function shouldCollapseExpandedImageId(id: string): boolean {
    return id.length === IMAGE_ID_LENGTH;
}

export function getSimilarIdSpans(canonical: string): SimilarIdSpan[] {
    if (!canonical)
        return [];

    const spans: SimilarIdSpan[] = [];
    const parts = canonical.split(andSplitRegex);
    let searchFrom = 0;

    for (const part of parts) {
        const trimmed = part.trim();
        const partStart = canonical.indexOf(part, searchFrom);
        if (partStart < 0) {
            searchFrom += part.length;
            continue;
        }

        if (similarRegex.test(trimmed)) {
            const payload = extractSimilarPayload(trimmed);
            if (!payload)
                continue;

            const { imageId } = parseSimilarSearchTarget(payload);
            if (shouldAbbreviateImageId(imageId)) {
                const idStartInPart = trimmed.indexOf(imageId);
                if (idStartInPart >= 0) {
                    const idStart = partStart + idStartInPart;
                    spans.push({
                        idStart,
                        idEnd: idStart + imageId.length,
                        fullId: imageId,
                    });
                }
            }
        }

        searchFrom = partStart + part.length;
    }

    return spans;
}

export function buildDisplaySegments(
    canonical: string,
    expandedIdStarts: ReadonlySet<number> = new Set(),
): DisplaySegment[] {
    const spans = getSimilarIdSpans(canonical);
    if (spans.length === 0)
        return [{ kind: 'text', text: canonical }];

    const segments: DisplaySegment[] = [];
    let lastEnd = 0;

    for (const span of [...spans].sort((left, right) => left.idStart - right.idStart)) {
        if (span.idStart > lastEnd)
            segments.push({ kind: 'text', text: canonical.slice(lastEnd, span.idStart) });

        const isExpanded = expandedIdStarts.has(span.idStart);
        segments.push({
            kind: 'id',
            span,
            text: isExpanded ? span.fullId : abbreviateImageId(span.fullId),
        });
        lastEnd = span.idEnd;
    }

    if (lastEnd < canonical.length)
        segments.push({ kind: 'text', text: canonical.slice(lastEnd) });

    return segments;
}

export function formatSearchDisplay(
    canonical: string,
    expandedIdStarts: ReadonlySet<number> = new Set(),
): string {
    return buildDisplaySegments(canonical, expandedIdStarts)
        .map(segment => segment.text)
        .join('');
}

export function getAbbreviatedIdDisplayRanges(
    canonical: string,
    expandedIdStarts: ReadonlySet<number> = new Set(),
): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    let offset = 0;

    for (const segment of buildDisplaySegments(canonical, expandedIdStarts)) {
        const segmentEnd = offset + segment.text.length;
        if (segment.kind === 'id' && !expandedIdStarts.has(segment.span.idStart))
            ranges.push({ start: offset, end: segmentEnd });

        offset = segmentEnd;
    }

    return ranges;
}

export function findAbbreviatedIdSegmentAtCursor(
    canonical: string,
    expandedIdStarts: ReadonlySet<number>,
    cursor: number,
    key: 'Backspace' | 'Delete',
): { span: SimilarIdSpan; segmentStart: number } | null {
    let offset = 0;

    for (const segment of buildDisplaySegments(canonical, expandedIdStarts)) {
        const segmentEnd = offset + segment.text.length;
        if (segment.kind === 'id' && !expandedIdStarts.has(segment.span.idStart)) {
            const matchesBackspace = key === 'Backspace' && cursor > offset && cursor <= segmentEnd;
            const matchesDelete = key === 'Delete' && cursor >= offset && cursor < segmentEnd;
            if (matchesBackspace || matchesDelete)
                return { span: segment.span, segmentStart: offset };
        }

        offset = segmentEnd;
    }

    return null;
}

function rebuildSimilarClause(displayPart: string, canonicalPart: string): string {
    const trimmedCanonical = canonicalPart.trim();
    const canonicalPayload = extractSimilarPayload(trimmedCanonical);
    if (!canonicalPayload)
        return displayPart;

    const canonicalParsed = parseSimilarSearchTarget(canonicalPayload);
    if (!shouldAbbreviateImageId(canonicalParsed.imageId))
        return displayPart;

    const displayPayload = extractSimilarPayload(displayPart.trim()) ?? displayPart.trim();
    let imageIdRaw = displayPayload;
    if (canonicalParsed.mode === 'embedding')
        imageIdRaw = imageIdRaw.replace(/^img\s+/i, '').trim();

    const { text: displayIdText, threshold: displayThreshold } = parseSearchTargetWithOptionalThreshold(imageIdRaw);
    const abbrev = abbreviateImageId(canonicalParsed.imageId);
    const imageId = displayIdText === abbrev ? canonicalParsed.imageId : displayIdText;

    let payload = '';
    if (canonicalParsed.mode === 'embedding')
        payload += 'img ';
    payload += imageId;
    if (displayThreshold !== undefined)
        payload += ` ${displayThreshold}`;

    return `${extractSimilarHeader(displayPart)}${payload}`;
}

export function canonicalFromDisplay(display: string, previousCanonical: string): string {
    const displayParts = display.split(andSplitRegex);
    const canonicalParts = previousCanonical.split(andSplitRegex);
    if (displayParts.length !== canonicalParts.length)
        return display;

    return displayParts
        .map((displayPart, index) => rebuildSimilarClause(displayPart, canonicalParts[index] ?? displayPart))
        .join(' AND ');
}

export function collapseExpandedIds(
    canonical: string,
    expandedIdStarts: ReadonlySet<number>,
): Set<number> {
    const nextExpanded = new Set(expandedIdStarts);
    for (const span of getSimilarIdSpans(canonical)) {
        if (nextExpanded.has(span.idStart) && shouldCollapseExpandedImageId(span.fullId))
            nextExpanded.delete(span.idStart);
    }
    return nextExpanded;
}

export function applyExpandedIdDeletion(args: {
    canonical: string;
    expandedIdStarts: ReadonlySet<number>;
    span: SimilarIdSpan;
    segmentStart: number;
    cursor: number;
    key: 'Backspace' | 'Delete';
}): { canonical: string; display: string; cursor: number; expandedIdStarts: Set<number> } {
    const expandedIdStarts = new Set(args.expandedIdStarts);
    expandedIdStarts.add(args.span.idStart);

    const expandedDisplay = formatSearchDisplay(args.canonical, expandedIdStarts);
    const offsetInSegment = Math.max(0, Math.min(args.cursor - args.segmentStart, args.span.fullId.length));
    const fullIdStart = args.segmentStart;

    let deleteAt: number;
    let nextCursor: number;

    if (args.key === 'Backspace') {
        deleteAt = fullIdStart + offsetInSegment - 1;
        if (deleteAt < fullIdStart)
            deleteAt = fullIdStart;
        nextCursor = deleteAt;
    } else {
        deleteAt = fullIdStart + offsetInSegment;
        if (deleteAt >= fullIdStart + args.span.fullId.length)
            deleteAt = fullIdStart + args.span.fullId.length - 1;
        nextCursor = deleteAt;
    }

    const editedDisplay = expandedDisplay.slice(0, deleteAt) + expandedDisplay.slice(deleteAt + 1);
    const canonical = canonicalFromDisplay(editedDisplay, args.canonical);
    const collapsedExpanded = collapseExpandedIds(canonical, expandedIdStarts);

    return {
        canonical,
        display: formatSearchDisplay(canonical, collapsedExpanded),
        cursor: nextCursor,
        expandedIdStarts: collapsedExpanded,
    };
}
