import type { AutocompleteMatch } from '$lib/svgen/autocompleteTypes';

export function normalizeAutocompleteText(value: string): string {
    return value
        .toLocaleLowerCase()
        .replaceAll('_', ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

type MatchRank = {
    group: number;
    segmentLength: number;
    fullLength: number;
};

function rankText(value: string, query: string): MatchRank {
    const normalized = normalizeAutocompleteText(value);
    const needle = normalizeAutocompleteText(query);
    if (normalized === needle)
        return { group: 0, segmentLength: normalized.length, fullLength: normalized.length };

    const segments = normalized.split(' ');
    const prefixSegments = segments.filter((segment) => segment.startsWith(needle));
    if (normalized.startsWith(needle) || prefixSegments.length) {
        return {
            group: 1,
            segmentLength: Math.min(
                normalized.startsWith(needle) ? normalized.length : Number.POSITIVE_INFINITY,
                ...prefixSegments.map((segment) => segment.length),
            ),
            fullLength: normalized.length,
        };
    }

    const containingSegments = segments.filter((segment) => segment.includes(needle));
    return {
        group: 2,
        segmentLength: containingSegments.length
            ? Math.min(...containingSegments.map((segment) => segment.length))
            : normalized.length,
        fullLength: normalized.length,
    };
}

export function compareAutocompleteMatches(
    left: AutocompleteMatch,
    right: AutocompleteMatch,
): number {
    const a = rankText(left.matchedText, left.query);
    const b = rankText(right.matchedText, right.query);
    return a.group - b.group
        || a.segmentLength - b.segmentLength
        || (right.score ?? 0) - (left.score ?? 0)
        || a.fullLength - b.fullLength
        || left.value.localeCompare(right.value);
}
