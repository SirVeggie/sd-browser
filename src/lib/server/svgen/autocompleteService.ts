import { promises as fs } from 'fs';
import type {
    AutocompleteBoundary,
    AutocompleteSource,
} from '$lib/svgen/autocompleteTypes';
import { AutocompleteDB } from './autocompleteDb';
import { parseAutocompleteSource } from './autocompleteParser';

const MAX_SOURCE_BYTES = 512 * 1024 * 1024;

export type AutocompleteSourceInput = {
    name: string;
    path: string;
    enabledByDefault: boolean;
    boundary: AutocompleteBoundary;
};

export function isAutocompleteBoundary(value: unknown): value is AutocompleteBoundary {
    return value === 'comma' || value === 'word';
}

export function validateAutocompleteSourceInput(
    value: unknown,
): AutocompleteSourceInput | null {
    if (!value || typeof value !== 'object')
        return null;
    const record = value as Record<string, unknown>;
    if (
        typeof record.name !== 'string'
        || !record.name.trim()
        || typeof record.path !== 'string'
        || !record.path.trim()
        || typeof record.enabledByDefault !== 'boolean'
        || !isAutocompleteBoundary(record.boundary)
    ) {
        return null;
    }
    return {
        name: record.name.trim(),
        path: record.path.trim(),
        enabledByDefault: record.enabledByDefault,
        boundary: record.boundary,
    };
}

function errorMessage(cause: unknown): string {
    if (cause instanceof Error)
        return cause.message;
    return String(cause);
}

export async function indexAutocompleteSource(id: string): Promise<AutocompleteSource> {
    const source = AutocompleteDB.getSource(id);
    if (!source)
        throw new Error('Autocomplete source not found');

    try {
        const stat = await fs.stat(source.path);
        if (!stat.isFile())
            throw new Error('Path is not a file');
        if (stat.size > MAX_SOURCE_BYTES)
            throw new Error('Source file is larger than 512 MB');

        const content = await fs.readFile(source.path, 'utf8');
        const items = parseAutocompleteSource(content);
        if (!items.length)
            throw new Error('No autocomplete items found in source file');
        AutocompleteDB.replaceItems(id, items);
    } catch (cause) {
        AutocompleteDB.setSourceError(id, errorMessage(cause));
    }

    return AutocompleteDB.getSource(id)!;
}
