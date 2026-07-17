import type { ImageSearchRef } from "$lib/stores/imageRefStore";

/** Match `#12` or `[12]` — digit slot references only. */
export const IMAGE_REF_TOKEN_REGEX = /#(\d+)|\[(\d+)\]/g;

/**
 * Zero-result search: `ID` with a 64-char hex id that cannot exist in the catalog.
 * The server marks unknown ID targets invalid and matches nothing (see searching.ts `idInvalid`).
 */
export const INVALID_REF_SEARCH = `ID ${"0".repeat(64)}`;

export type SearchRefRange = { start: number; end: number; slot: number; valid: boolean };

function toRefMap(refs: Map<number, string> | ImageSearchRef[]): Map<number, string> {
    if (refs instanceof Map)
        return refs;
    return new Map(refs.map((ref) => [ref.slot, ref.id]));
}

function getSlotFromMatch(match: RegExpExecArray): number {
    return Number(match[1] ?? match[2]);
}

export function expandSearchReferences(
    search: string,
    refs: Map<number, string> | ImageSearchRef[],
): string {
    const map = toRefMap(refs);

    return search.replace(IMAGE_REF_TOKEN_REGEX, (match, hashSlot: string | undefined, bracketSlot: string | undefined) => {
        const slot = Number(hashSlot ?? bracketSlot);
        return map.get(slot) ?? match;
    });
}

export function hasInvalidSearchReferences(
    search: string,
    refs: Map<number, string> | ImageSearchRef[],
): boolean {
    const map = toRefMap(refs);
    const regex = new RegExp(IMAGE_REF_TOKEN_REGEX.source, "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(search)) !== null) {
        if (!map.has(getSlotFromMatch(match)))
            return true;
    }

    return false;
}

export function getSearchReferenceRanges(
    search: string,
    refs: Map<number, string> | ImageSearchRef[],
): SearchRefRange[] {
    const map = toRefMap(refs);
    const ranges: SearchRefRange[] = [];
    const regex = new RegExp(IMAGE_REF_TOKEN_REGEX.source, "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(search)) !== null) {
        const slot = getSlotFromMatch(match);
        ranges.push({
            start: match.index,
            end: match.index + match[0].length,
            slot,
            valid: map.has(slot),
        });
    }

    return ranges;
}
