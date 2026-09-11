import type {
    AutocompleteBoundary,
    AutocompleteMatch,
    AutocompleteSearchQuery,
} from './autocompleteTypes';

const LEADING_WRAPPERS = /^[\s([{<]+/;
const TRAILING_WRAPPERS = /[\s)\]}>]+$/;
const WEIGHT_SUFFIX = /:\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*[\])}>]*$/;

type CompletionRange = {
    start: number;
    end: number;
    text: string;
};

function completionRange(value: string, caret: number, boundary: AutocompleteBoundary): CompletionRange {
    const safeCaret = Math.max(0, Math.min(caret, value.length));
    let start = boundary === 'comma'
        ? value.lastIndexOf(',', safeCaret - 1) + 1
        : Math.max(
            value.lastIndexOf(',', safeCaret - 1),
            value.lastIndexOf(' ', safeCaret - 1),
            value.lastIndexOf('\n', safeCaret - 1),
            value.lastIndexOf('\t', safeCaret - 1),
        ) + 1;
    let end = safeCaret;
    let raw = value.slice(start, end);

    const weight = raw.match(WEIGHT_SUFFIX);
    if (weight?.index != null) {
        end = start + weight.index;
        raw = raw.slice(0, weight.index);
    }

    const leading = raw.match(LEADING_WRAPPERS)?.[0].length ?? 0;
    const trailing = raw.match(TRAILING_WRAPPERS)?.[0].length ?? 0;
    start += leading;
    end = Math.max(start, end - trailing);

    return {
        start,
        end,
        text: value.slice(start, end),
    };
}

function passesMinimum(text: string, minChars: number, manual: boolean): boolean {
    return manual || text.trim().length >= minChars;
}

export function buildAutocompleteQueries(
    value: string,
    caret: number,
    boundary: AutocompleteBoundary,
    minChars: number,
    manual = false,
): AutocompleteSearchQuery[] {
    const range = completionRange(value, caret, boundary);
    const trimmed = range.text.replace(/\s+$/g, '');
    if (!trimmed)
        return manual
            ? [{ text: '', replaceStart: range.end, replaceEnd: range.end }]
            : [];

    if (boundary === 'word') {
        const leading = trimmed.match(/^\s*/)?.[0].length ?? 0;
        const text = trimmed.slice(leading);
        return passesMinimum(text, minChars, manual)
            ? [{
                text,
                replaceStart: range.start + leading,
                replaceEnd: range.end,
            }]
            : [];
    }

    const queries: AutocompleteSearchQuery[] = [];
    let offset = range.text.length - range.text.replace(/^\s+/, '').length;
    let text = trimmed.slice(offset);

    while (text) {
        if (passesMinimum(text, minChars, manual)) {
            queries.push({
                text,
                replaceStart: range.start + offset,
                replaceEnd: range.end,
            });
        }
        const firstWord = text.match(/^\S+\s+/);
        if (!firstWord)
            break;
        offset += firstWord[0].length;
        text = text.slice(firstWord[0].length);
    }

    return queries;
}

export function applyAutocompleteMatch(
    value: string,
    replacement: string,
    replaceStart: number,
    replaceEnd: number,
): { value: string; caret: number } {
    const start = Math.max(0, Math.min(replaceStart, value.length));
    const end = Math.max(start, Math.min(replaceEnd, value.length));
    const next = value.slice(0, start) + replacement + value.slice(end);
    return {
        value: next,
        caret: start + replacement.length,
    };
}

/** Drop matches that would leave the field unchanged (exact complete item). */
export function usefulAutocompleteMatches(
    matches: AutocompleteMatch[],
    currentValue: string,
): AutocompleteMatch[] {
    return matches.filter((match) =>
        applyAutocompleteMatch(
            currentValue,
            match.value,
            match.replaceStart,
            match.replaceEnd,
        ).value !== currentValue,
    );
}
