import type {
    AutocompleteBoundary,
    AutocompleteMatch,
    AutocompleteSearchQuery,
} from './autocompleteTypes';

/** Letters, numbers, `_`, and `-` are word characters; anything else may prefix a query. */
const LEADING_NON_WORD = /^[^\p{L}\p{N}_-]+/u;

type CompletionRange = {
    start: number;
    end: number;
    text: string;
};

function lastBreak(value: string, caret: number, marks: readonly string[]): number {
    let index = -1;
    for (const mark of marks) {
        index = Math.max(index, value.lastIndexOf(mark, caret - 1));
    }
    return index + 1;
}

const COMMA_BREAKS = [',', '\n', '\r'] as const;
const WORD_BREAKS = [',', ' ', '\n', '\r', '\t'] as const;

function completionRange(value: string, caret: number, boundary: AutocompleteBoundary): CompletionRange {
    const safeCaret = Math.max(0, Math.min(caret, value.length));
    const start = lastBreak(
        value,
        safeCaret,
        boundary === 'comma' ? COMMA_BREAKS : WORD_BREAKS,
    );
    return {
        start,
        end: safeCaret,
        text: value.slice(start, safeCaret),
    };
}

function queryFromText(
    text: string,
    replaceStart: number,
    replaceEnd: number,
    minChars: number,
    manual: boolean,
): AutocompleteSearchQuery | null {
    const skipped = text.match(LEADING_NON_WORD)?.[0].length ?? 0;
    const queryText = text.slice(skipped);
    if (!passesMinimum(queryText, minChars, manual))
        return null;
    return {
        text: queryText,
        replaceStart: replaceStart + skipped,
        replaceEnd,
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
        const query = queryFromText(trimmed, range.start, range.end, minChars, manual);
        return query ? [query] : [];
    }

    const queries: AutocompleteSearchQuery[] = [];
    let offset = range.text.length - range.text.replace(/^\s+/, '').length;
    let text = trimmed.slice(offset);

    while (text) {
        const query = queryFromText(text, range.start + offset, range.end, minChars, manual);
        if (query)
            queries.push(query);
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

export type AutocompleteInputAction = 'search' | 'delete' | 'ignore';

/** Inserted text searches. Delete refreshes an open list and must not open a closed one. */
export function autocompleteInputAction(
    inputType: string | undefined,
    previousValue: string,
    nextValue: string,
): AutocompleteInputAction {
    if (previousValue === nextValue)
        return 'ignore';
    const deleted = inputType
        ? inputType.startsWith('delete')
        : nextValue.length < previousValue.length;
    return deleted ? 'delete' : 'search';
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
