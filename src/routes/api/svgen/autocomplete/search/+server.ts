import { invalidAuth } from '$lib/server/auth';
import { error, success } from '$lib/server/responses';
import { AutocompleteDB } from '$lib/server/svgen/autocompleteDb';
import { compareAutocompleteMatches } from '$lib/server/svgen/autocompleteRank';
import { refreshAutocompleteSourcesIfStale } from '$lib/server/svgen/autocompleteService';
import type {
    AutocompleteMatch,
    AutocompleteSearchQuery,
    AutocompleteSourceSearch,
} from '$lib/svgen/autocompleteTypes';

function validQuery(value: unknown): value is AutocompleteSearchQuery {
    if (!value || typeof value !== 'object')
        return false;
    const query = value as Record<string, unknown>;
    return typeof query.text === 'string'
        && query.text.length <= 200
        && Number.isInteger(query.replaceStart)
        && Number.isInteger(query.replaceEnd)
        && Number(query.replaceStart) >= 0
        && Number(query.replaceEnd) >= Number(query.replaceStart);
}

function validSourceSearch(value: unknown): value is AutocompleteSourceSearch {
    if (!value || typeof value !== 'object')
        return false;
    const request = value as Record<string, unknown>;
    return typeof request.sourceId === 'string'
        && request.sourceId.length <= 100
        && Array.isArray(request.queries)
        && request.queries.length <= 20
        && request.queries.every(validQuery);
}

function mergeDuplicate(
    existing: AutocompleteMatch,
    next: AutocompleteMatch,
): AutocompleteMatch {
    const aliases = [...new Set([...existing.aliases, ...next.aliases])];
    const better = compareAutocompleteMatches(next, existing) < 0 ? next : existing;
    return {
        ...better,
        aliases,
        info: existing.info || next.info,
    };
}

export async function POST(e) {
    const authError = invalidAuth(e);
    if (authError)
        return authError;

    let body: unknown;
    try {
        body = await e.request.json();
    } catch {
        return error('Invalid JSON request body', 400);
    }
    if (!body || typeof body !== 'object')
        return error('Invalid autocomplete search', 400);
    const request = body as Record<string, unknown>;
    if (
        !Array.isArray(request.sources)
        || request.sources.length > 50
        || !request.sources.every(validSourceSearch)
    ) {
        return error('Invalid autocomplete search sources', 400);
    }
    const maxRows = Math.max(1, Math.min(100, Number(request.maxRows) || 50));
    const sources = request.sources as AutocompleteSourceSearch[];
    await refreshAutocompleteSourcesIfStale(sources.map((source) => source.sourceId));

    const byValue = new Map<string, AutocompleteMatch>();
    for (const source of sources) {
        for (const match of AutocompleteDB.searchSource(source.sourceId, source.queries, maxRows)) {
            const key = match.value;
            const existing = byValue.get(key);
            byValue.set(key, existing ? mergeDuplicate(existing, match) : match);
        }
    }

    return success({
        matches: [...byValue.values()]
            .sort(compareAutocompleteMatches)
            .slice(0, maxRows),
    });
}
