/** Leeway applied to every aspect-ratio comparison (± absolute on width/height). */
export const ASPECT_RATIO_TOLERANCE = 0.1;

export type AspectComparisonOp = '=' | '!=' | '<' | '<=' | '>' | '>=';

export type AspectComparison = {
    op: AspectComparisonOp;
    value: number;
};

const OPERATOR_PATTERN = '>=|<=|!=|=|>|<';
const VALUE_PATTERN = '\\d+(?:\\.\\d+)?(?::\\d+(?:\\.\\d+)?)?';
const ATTACHED_COMPARISON_REGEX = new RegExp(`^(${OPERATOR_PATTERN})(${VALUE_PATTERN})$`);
const BARE_OPERATOR_REGEX = new RegExp(`^(?:${OPERATOR_PATTERN})$`);
const BARE_VALUE_REGEX = new RegExp(`^${VALUE_PATTERN}$`);

/**
 * Parse a ratio (`16:9`) or decimal (`1.7`) into width/height.
 * Returns undefined when the token is not a valid aspect value.
 */
export function parseAspectRatioValue(token: string): number | undefined {
    const ratioMatch = token.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (ratioMatch) {
        const width = Number(ratioMatch[1]);
        const height = Number(ratioMatch[2]);
        if (!Number.isFinite(width) || !Number.isFinite(height) || height === 0)
            return undefined;
        return width / height;
    }

    if (/^\d+(?:\.\d+)?$/.test(token)) {
        const value = Number(token);
        return Number.isFinite(value) ? value : undefined;
    }

    return undefined;
}

export function isAspectBodyToken(word: string): boolean {
    if (BARE_OPERATOR_REGEX.test(word))
        return true;
    if (parseAspectRatioValue(word) !== undefined)
        return true;
    const attached = word.match(ATTACHED_COMPARISON_REGEX);
    return !!attached && parseAspectRatioValue(attached[2]) !== undefined;
}

/**
 * Parse the body of an ASP/ASPECT clause into comparisons.
 * Bare values (no operator) are treated as equals.
 * Returns undefined when the body is empty or contains invalid tokens.
 */
export function parseAspectComparisons(raw: string): AspectComparison[] | undefined {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0)
        return undefined;

    const comparisons: AspectComparison[] = [];
    let index = 0;

    while (index < tokens.length) {
        const token = tokens[index];

        const attached = token.match(ATTACHED_COMPARISON_REGEX);
        if (attached) {
            const value = parseAspectRatioValue(attached[2]);
            if (value === undefined)
                return undefined;
            comparisons.push({ op: attached[1] as AspectComparisonOp, value });
            index += 1;
            continue;
        }

        if (BARE_OPERATOR_REGEX.test(token)) {
            const valueToken = tokens[index + 1];
            if (!valueToken)
                return undefined;
            const value = parseAspectRatioValue(valueToken);
            if (value === undefined)
                return undefined;
            comparisons.push({ op: token as AspectComparisonOp, value });
            index += 2;
            continue;
        }

        if (BARE_VALUE_REGEX.test(token)) {
            const value = parseAspectRatioValue(token);
            if (value === undefined)
                return undefined;
            comparisons.push({ op: '=', value });
            index += 1;
            continue;
        }

        return undefined;
    }

    return comparisons.length > 0 ? comparisons : undefined;
}

function compareAspect(ratio: number, comparison: AspectComparison): boolean {
    const target = comparison.value;
    const lo = target - ASPECT_RATIO_TOLERANCE;
    const hi = target + ASPECT_RATIO_TOLERANCE;

    switch (comparison.op) {
        case '=':
            return lo < ratio && ratio < hi;
        case '!=':
            return !(lo < ratio && ratio < hi);
        case '<':
            return ratio < hi;
        case '<=':
            return ratio <= hi;
        case '>':
            return ratio > lo;
        case '>=':
            return ratio >= lo;
        default: {
            const _exhaustive: never = comparison.op;
            return _exhaustive;
        }
    }
}

/**
 * Evaluate ASP/ASPECT comparisons against image dimensions.
 * Missing or zero width/height always fails.
 * Equals within a clause are OR'd; all other ops are AND'd; when both kinds
 * are present, the clause matches if either group succeeds.
 */
export function matchesAspectComparisons(
    width: number | undefined,
    height: number | undefined,
    comparisons: AspectComparison[],
): boolean {
    if (!width || !height)
        return false;

    const ratio = width / height;
    if (!Number.isFinite(ratio))
        return false;

    const equals = comparisons.filter((c) => c.op === '=');
    const rest = comparisons.filter((c) => c.op !== '=');

    const equalsMatch = equals.length > 0 && equals.some((c) => compareAspect(ratio, c));
    const restMatch = rest.length === 0 || rest.every((c) => compareAspect(ratio, c));

    if (equals.length > 0 && rest.length > 0)
        return equalsMatch || restMatch;
    if (equals.length > 0)
        return equalsMatch;
    return restMatch;
}
