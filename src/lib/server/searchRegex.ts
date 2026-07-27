import RE2 from 're2';

/**
 * Compiled search regex via RE2 (linear-time).
 *
 * Do not fall back to JS `RegExp` for matching: patterns RE2 rejects but JS
 * accepts (e.g. empty `[^]` → `([^]*\n)*`) can catastrophically backtrack and
 * block the Node event loop, so search abort cannot run.
 *
 * Unsupported JS-only features (lookaheads, backreferences, …) fail at compile
 * with {@link UnsupportedSearchRegexError}.
 */
export type SearchRegex = {
    readonly source: string;
    readonly flags: string;
    readonly engine: 're2';
    test(text: string): boolean;
};

export class UnsupportedSearchRegexError extends Error {
    constructor(source: string, cause?: unknown) {
        const detail = cause instanceof Error && cause.message
            ? cause.message
            : 'unsupported syntax';
        super(`Unsupported regex (RE2): ${detail}`);
        this.name = 'UnsupportedSearchRegexError';
        this.source = source;
    }

    readonly source: string;
}

export function compileSearchRegex(source: string, flags = 'is'): SearchRegex {
    try {
        const re = new RE2(source, flags);
        return {
            source,
            flags,
            engine: 're2',
            test: (text) => re.test(text ?? ''),
        };
    } catch (cause) {
        throw new UnsupportedSearchRegexError(source, cause);
    }
}

export function isSearchRegexSupported(source: string, flags = 'is'): boolean {
    try {
        compileSearchRegex(source, flags);
        return true;
    } catch {
        return false;
    }
}
