import { invalidAuth } from '$lib/server/auth';
import { error, success } from '$lib/server/responses';
import { AutocompleteDB } from '$lib/server/svgen/autocompleteDb';
import {
    indexAutocompleteSource,
    validateAutocompleteSourceInput,
} from '$lib/server/svgen/autocompleteService';
import { v4 as uuidv4 } from 'uuid';

export async function GET(e) {
    const authError = invalidAuth(e);
    if (authError)
        return authError;
    return success({ sources: AutocompleteDB.listSources() });
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
    const input = validateAutocompleteSourceInput(body);
    if (!input)
        return error('Invalid autocomplete source', 400);

    const now = Date.now();
    const position = AutocompleteDB.listSources()
        .reduce((max, source) => Math.max(max, source.position + 1), 0);
    const id = uuidv4();
    try {
        AutocompleteDB.upsertSource({
            id,
            ...input,
            position,
            itemCount: 0,
            error: null,
            updatedAt: now,
        });
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return error(
            message.includes('UNIQUE')
                ? `An autocomplete source named '${input.name}' already exists`
                : message,
            message.includes('UNIQUE') ? 409 : 500,
        );
    }

    return success({ source: await indexAutocompleteSource(id) });
}
