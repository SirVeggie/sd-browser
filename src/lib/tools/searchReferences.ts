import type { ImageSearchRef } from "$lib/stores/imageRefStore";

/** Match `#12`, `[12]`, or `[refs]` (all current reference ids). */
export const IMAGE_REF_TOKEN_REGEX = /#(\d+)|\[(\d+)\]|\[refs\]/gi;

/**
 * Zero-result search: `ID` with a 64-char hex id that cannot exist in the catalog.
 * The server marks unknown ID targets invalid and matches nothing (see searching.ts `idInvalid`).
 */
export const INVALID_REF_SEARCH = `ID ${"0".repeat(64)}`;

export type SearchRefRange = {
    start: number;
    end: number;
    /** Slot for `#n` / `[n]`; `null` for `[refs]`. */
    slot: number | null;
    valid: boolean;
};

function toRefMap(refs: Map<number, string> | ImageSearchRef[]): Map<number, string> {
    if (refs instanceof Map)
        return refs;
    return new Map(refs.map((ref) => [ref.slot, ref.id]));
}

function isAllRefsToken(token: string): boolean {
    return /^\[refs\]$/i.test(token);
}

function getSlotFromMatch(match: RegExpExecArray): number {
    return Number(match[1] ?? match[2]);
}

function listRefIds(map: Map<number, string>): string[] {
    return [...map.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, id]) => id);
}

function createRefTokenRegex(): RegExp {
    return new RegExp(IMAGE_REF_TOKEN_REGEX.source, "gi");
}

export function expandSearchReferences(
    search: string,
    refs: Map<number, string> | ImageSearchRef[],
): string {
    const map = toRefMap(refs);

    return search.replace(createRefTokenRegex(), (match, hashSlot: string | undefined, bracketSlot: string | undefined) => {
        if (isAllRefsToken(match)) {
            const ids = listRefIds(map);
            return ids.length > 0 ? ids.join(" ") : match;
        }

        const slot = Number(hashSlot ?? bracketSlot);
        return map.get(slot) ?? match;
    });
}

export function hasInvalidSearchReferences(
    search: string,
    refs: Map<number, string> | ImageSearchRef[],
): boolean {
    const map = toRefMap(refs);
    const regex = createRefTokenRegex();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(search)) !== null) {
        if (isAllRefsToken(match[0])) {
            if (map.size === 0)
                return true;
            continue;
        }

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
    const regex = createRefTokenRegex();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(search)) !== null) {
        if (isAllRefsToken(match[0])) {
            ranges.push({
                start: match.index,
                end: match.index + match[0].length,
                slot: null,
                valid: map.size > 0,
            });
            continue;
        }

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
