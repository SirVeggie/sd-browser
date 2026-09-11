import { get } from 'svelte/store';
import { page } from '$app/stores';
import { authStore } from '$lib/stores/authStore';
import type {
    AutocompleteMatch,
    AutocompleteSource,
    AutocompleteSourceSearch,
} from './autocompleteTypes';
import { formatUnknownError } from './formatError';

function url(path: string): string {
    return get(page).url.origin + path;
}

function headers(): HeadersInit {
    return {
        Authorization: `Bearer ${get(authStore).password}`,
        'Content-Type': 'application/json',
    };
}

async function responseBody(response: Response): Promise<unknown> {
    return response.json().catch(() => ({}));
}

function throwIfFailed(response: Response, body: unknown, fallback: string): void {
    if (!response.ok)
        throw new Error(formatUnknownError(body, fallback), { cause: body });
}

export async function listAutocompleteSources(): Promise<AutocompleteSource[]> {
    const response = await fetch(url('/api/svgen/autocomplete/sources'), {
        headers: headers(),
    });
    const body = await responseBody(response);
    throwIfFailed(response, body, 'Failed to load autocomplete sources');
    return (body as { sources?: AutocompleteSource[] }).sources ?? [];
}

export async function createAutocompleteSource(
    input: Pick<AutocompleteSource, 'name' | 'path' | 'enabledByDefault' | 'boundary'>,
): Promise<AutocompleteSource> {
    const response = await fetch(url('/api/svgen/autocomplete/sources'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(input),
    });
    const body = await responseBody(response);
    throwIfFailed(response, body, 'Failed to add autocomplete source');
    return (body as { source: AutocompleteSource }).source;
}

export async function updateAutocompleteSource(
    source: Pick<AutocompleteSource, 'id' | 'name' | 'path' | 'enabledByDefault' | 'boundary'>,
    reindex = false,
): Promise<AutocompleteSource> {
    const response = await fetch(
        url(`/api/svgen/autocomplete/sources/${encodeURIComponent(source.id)}`),
        {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify({ ...source, reindex }),
        },
    );
    const body = await responseBody(response);
    throwIfFailed(response, body, 'Failed to update autocomplete source');
    return (body as { source: AutocompleteSource }).source;
}

export async function deleteAutocompleteSource(id: string): Promise<void> {
    const response = await fetch(
        url(`/api/svgen/autocomplete/sources/${encodeURIComponent(id)}`),
        {
            method: 'DELETE',
            headers: headers(),
        },
    );
    const body = await responseBody(response);
    throwIfFailed(response, body, 'Failed to delete autocomplete source');
}

export async function searchAutocomplete(
    sources: AutocompleteSourceSearch[],
    maxRows: number,
    signal?: AbortSignal,
): Promise<AutocompleteMatch[]> {
    const response = await fetch(url('/api/svgen/autocomplete/search'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ sources, maxRows }),
        signal,
    });
    const body = await responseBody(response);
    throwIfFailed(response, body, 'Autocomplete search failed');
    return (body as { matches?: AutocompleteMatch[] }).matches ?? [];
}
