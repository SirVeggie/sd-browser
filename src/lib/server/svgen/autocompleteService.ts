import { promises as fs } from 'fs';
import type {
    AutocompleteBoundary,
    AutocompleteSource,
} from '$lib/svgen/autocompleteTypes';
import { AutocompleteDB } from './autocompleteDb';
import {
    fileMtimeMs,
    sourceFileNeedsReindex,
} from './autocompleteFreshness';
import { parseAutocompleteSource } from './autocompleteParser';

const MAX_SOURCE_BYTES = 512 * 1024 * 1024;

const refreshInflight = new Map<string, Promise<void>>();
const failedRefreshMtimes = new Map<string, number>();

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

async function readSourceFileMtime(filePath: string): Promise<number | null> {
    try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile())
            return null;
        return fileMtimeMs(stat.mtimeMs);
    } catch {
        return null;
    }
}

async function writeIndexFromFile(id: string): Promise<void> {
    const source = AutocompleteDB.getSource(id);
    if (!source)
        throw new Error('Autocomplete source not found');

    const stat = await fs.stat(source.path);
    if (!stat.isFile())
        throw new Error('Path is not a file');
    if (stat.size > MAX_SOURCE_BYTES)
        throw new Error('Source file is larger than 512 MB');

    const content = await fs.readFile(source.path, 'utf8');
    const items = parseAutocompleteSource(content);
    if (!items.length)
        throw new Error('No autocomplete items found in source file');
    const mtime = await readSourceFileMtime(source.path) ?? fileMtimeMs(stat.mtimeMs);
    AutocompleteDB.replaceItems(id, items);
    AutocompleteDB.setSourceFileMtime(id, mtime);
    failedRefreshMtimes.delete(id);
}

export async function indexAutocompleteSource(id: string): Promise<AutocompleteSource> {
    if (!AutocompleteDB.getSource(id))
        throw new Error('Autocomplete source not found');

    try {
        await writeIndexFromFile(id);
    } catch (cause) {
        AutocompleteDB.setSourceError(id, errorMessage(cause));
    }

    return AutocompleteDB.getSource(id)!;
}

async function refreshSourceIfStale(id: string): Promise<void> {
    const source = AutocompleteDB.getSourceFreshness(id);
    if (!source)
        return;

    const fileMtime = await readSourceFileMtime(source.path);
    const needsReindex = (source.itemCount === 0 && fileMtime != null)
        || sourceFileNeedsReindex(source.fileMtime, source.updatedAt, fileMtime);
    if (!needsReindex) {
        if (fileMtime != null && source.fileMtime == null)
            AutocompleteDB.setSourceFileMtime(id, fileMtime);
        return;
    }
    if (fileMtime != null && failedRefreshMtimes.get(id) === fileMtime)
        return;

    try {
        await writeIndexFromFile(id);
    } catch (cause) {
        if (fileMtime != null)
            failedRefreshMtimes.set(id, fileMtime);
        console.error(`Autocomplete auto-refresh failed for ${id}`, cause);
    }
}

export async function refreshAutocompleteSourcesIfStale(ids: string[]): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    for (const id of uniqueIds) {
        const pending = refreshInflight.get(id);
        if (pending) {
            await pending;
            continue;
        }
        const work = refreshSourceIfStale(id).finally(() => refreshInflight.delete(id));
        refreshInflight.set(id, work);
        await work;
    }
}

export async function refreshAllAutocompleteSourcesIfStale(): Promise<void> {
    await refreshAutocompleteSourcesIfStale(
        AutocompleteDB.listSourceFreshness().map((source) => source.id),
    );
}
