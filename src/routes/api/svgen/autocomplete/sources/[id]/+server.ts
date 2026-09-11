import { invalidAuth } from '$lib/server/auth';
import { error, success } from '$lib/server/responses';
import { AutocompleteDB } from '$lib/server/svgen/autocompleteDb';
import {
    indexAutocompleteSource,
    validateAutocompleteSourceInput,
} from '$lib/server/svgen/autocompleteService';

export async function PATCH(e) {
    const authError = invalidAuth(e);
    if (authError)
        return authError;

    const existing = AutocompleteDB.getSource(e.params.id);
    if (!existing)
        return error('Autocomplete source not found', 404);

    let body: unknown;
    try {
        body = await e.request.json();
    } catch {
        return error('Invalid JSON request body', 400);
    }
    const input = validateAutocompleteSourceInput(body);
    if (!input)
        return error('Invalid autocomplete source', 400);
    const reindex = !!body
        && typeof body === 'object'
        && (body as Record<string, unknown>).reindex === true;

    try {
        AutocompleteDB.upsertSource({
            ...existing,
            ...input,
            updatedAt: Date.now(),
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

    const pathChanged = input.path !== existing.path;
    const source = pathChanged || reindex
        ? await indexAutocompleteSource(existing.id)
        : AutocompleteDB.getSource(existing.id)!;
    return success({ source });
}

export async function DELETE(e) {
    const authError = invalidAuth(e);
    if (authError)
        return authError;
    if (!AutocompleteDB.deleteSource(e.params.id))
        return error('Autocomplete source not found', 404);
    return success();
}
