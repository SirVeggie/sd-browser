export type ByteRange = {
    start: number;
    end: number;
};

export type ParseByteRangeResult =
    | { kind: "none" }
    | { kind: "unsatisfiable" }
    | { kind: "range"; start: number; end: number };

/**
 * Parse a single RFC 7233 `bytes` range.
 * Unknown units and missing headers are ignored (`none` → full 200).
 * Only the first range is used when several are listed.
 */
export function parseByteRange(
    header: string | null | undefined,
    size: number,
): ParseByteRangeResult {
    if (header == null)
        return { kind: "none" };
    const trimmed = header.trim();
    if (!trimmed)
        return { kind: "none" };
    if (!trimmed.toLowerCase().startsWith("bytes="))
        return { kind: "none" };

    const spec = trimmed.slice(trimmed.indexOf("=") + 1).split(",")[0]?.trim();
    if (!spec || size <= 0)
        return { kind: "unsatisfiable" };

    const dash = spec.indexOf("-");
    if (dash < 0)
        return { kind: "unsatisfiable" };

    const left = spec.slice(0, dash);
    const right = spec.slice(dash + 1);

    if (left === "") {
        const suffix = Number(right);
        if (!Number.isInteger(suffix) || suffix <= 0)
            return { kind: "unsatisfiable" };
        if (suffix >= size)
            return { kind: "range", start: 0, end: size - 1 };
        return { kind: "range", start: size - suffix, end: size - 1 };
    }

    const start = Number(left);
    if (!Number.isInteger(start) || start < 0)
        return { kind: "unsatisfiable" };

    let end: number;
    if (right === "") {
        end = size - 1;
    } else {
        end = Number(right);
        if (!Number.isInteger(end) || end < 0)
            return { kind: "unsatisfiable" };
    }

    if (start >= size || start > end)
        return { kind: "unsatisfiable" };
    if (end >= size)
        end = size - 1;
    return { kind: "range", start, end };
}
