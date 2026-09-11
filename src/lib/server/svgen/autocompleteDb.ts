import type { Database as BetterSqlite3 } from 'better-sqlite3';
import path from 'path';
import type {
    AutocompleteBoundary,
    AutocompleteMatch,
    AutocompleteSearchQuery,
    AutocompleteSource,
} from '$lib/svgen/autocompleteTypes';
import { datapath } from '../paths';
import { openDatabase } from '../sqlite';
import type { ParsedAutocompleteItem } from './autocompleteParser';
import {
    compareAutocompleteMatches,
    normalizeAutocompleteText,
} from './autocompleteRank';

type SourceRow = {
    id: string;
    name: string;
    path: string;
    enabledByDefault: number;
    boundary: AutocompleteBoundary;
    position: number;
    itemCount: number;
    error: string | null;
    updatedAt: number;
};

type SearchRow = {
    itemId: number;
    matchedText: string;
    matchedAlias: number;
    value: string;
    aliases: string;
    info: string;
};

function sourceFromRow(row: SourceRow): AutocompleteSource {
    return {
        ...row,
        enabledByDefault: row.enabledByDefault !== 0,
    };
}

function parseAliases(raw: string): string[] {
    try {
        const value = JSON.parse(raw) as unknown;
        return Array.isArray(value)
            ? value.filter((alias): alias is string => typeof alias === 'string')
            : [];
    } catch {
        return [];
    }
}

function uniqueSearchRows(rows: SearchRow[], query: string): SearchRow[] {
    const best = new Map<number, SearchRow>();
    for (const row of rows) {
        const previous = best.get(row.itemId);
        if (!previous) {
            best.set(row.itemId, row);
            continue;
        }
        const previousMatch: AutocompleteMatch = {
            sourceId: '',
            value: previous.value,
            aliases: [],
            info: '',
            matchedText: previous.matchedText,
            matchedAlias: previous.matchedAlias !== 0,
            query,
            replaceStart: 0,
            replaceEnd: 0,
        };
        const nextMatch: AutocompleteMatch = {
            ...previousMatch,
            matchedText: row.matchedText,
            matchedAlias: row.matchedAlias !== 0,
        };
        if (compareAutocompleteMatches(nextMatch, previousMatch) < 0)
            best.set(row.itemId, row);
    }
    return [...best.values()];
}

export class AutocompleteDB {
    private static db: BetterSqlite3;
    private static ready = false;

    private static setup(): BetterSqlite3 {
        if (AutocompleteDB.ready)
            return AutocompleteDB.db;

        AutocompleteDB.db = openDatabase(path.join(datapath, 'svgen.sqlite3'));
        AutocompleteDB.db.exec(`
            CREATE TABLE IF NOT EXISTS autocomplete_sources (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                path TEXT NOT NULL,
                enabledByDefault INTEGER NOT NULL DEFAULT 0,
                boundary TEXT NOT NULL DEFAULT 'comma',
                position INTEGER NOT NULL DEFAULT 0,
                itemCount INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                updatedAt INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS autocomplete_items (
                id INTEGER PRIMARY KEY,
                sourceId TEXT NOT NULL,
                value TEXT NOT NULL,
                aliases TEXT NOT NULL,
                info TEXT NOT NULL,
                FOREIGN KEY(sourceId) REFERENCES autocomplete_sources(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS autocomplete_items_source
                ON autocomplete_items(sourceId);
            CREATE VIRTUAL TABLE IF NOT EXISTS autocomplete_terms USING fts5(
                sourceId UNINDEXED,
                itemId UNINDEXED,
                term,
                matchedText UNINDEXED,
                matchedAlias UNINDEXED,
                tokenize='trigram'
            );
        `);
        AutocompleteDB.ready = true;
        return AutocompleteDB.db;
    }

    static listSources(): AutocompleteSource[] {
        const rows = AutocompleteDB.setup().prepare(`
            SELECT * FROM autocomplete_sources
            ORDER BY position ASC, name COLLATE NOCASE ASC
        `).all() as SourceRow[];
        return rows.map(sourceFromRow);
    }

    static getSource(id: string): AutocompleteSource | undefined {
        const row = AutocompleteDB.setup()
            .prepare('SELECT * FROM autocomplete_sources WHERE id = ?')
            .get(id) as SourceRow | undefined;
        return row ? sourceFromRow(row) : undefined;
    }

    static upsertSource(source: AutocompleteSource): void {
        AutocompleteDB.setup().prepare(`
            INSERT INTO autocomplete_sources (
                id, name, path, enabledByDefault, boundary, position,
                itemCount, error, updatedAt
            ) VALUES (
                @id, @name, @path, @enabledByDefault, @boundary, @position,
                @itemCount, @error, @updatedAt
            )
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                path = excluded.path,
                enabledByDefault = excluded.enabledByDefault,
                boundary = excluded.boundary,
                position = excluded.position,
                itemCount = excluded.itemCount,
                error = excluded.error,
                updatedAt = excluded.updatedAt
        `).run({
            ...source,
            enabledByDefault: source.enabledByDefault ? 1 : 0,
        });
    }

    static deleteSource(id: string): boolean {
        const db = AutocompleteDB.setup();
        const remove = db.transaction(() => {
            db.prepare('DELETE FROM autocomplete_terms WHERE sourceId = ?').run(id);
            db.prepare('DELETE FROM autocomplete_items WHERE sourceId = ?').run(id);
            return db.prepare('DELETE FROM autocomplete_sources WHERE id = ?').run(id).changes > 0;
        });
        return remove();
    }

    static replaceItems(sourceId: string, items: ParsedAutocompleteItem[]): void {
        const db = AutocompleteDB.setup();
        const insertItem = db.prepare(`
            INSERT INTO autocomplete_items (sourceId, value, aliases, info)
            VALUES (?, ?, ?, ?)
        `);
        const insertTerm = db.prepare(`
            INSERT INTO autocomplete_terms (
                sourceId, itemId, term, matchedText, matchedAlias
            ) VALUES (?, ?, ?, ?, ?)
        `);
        const replace = db.transaction(() => {
            db.prepare('DELETE FROM autocomplete_terms WHERE sourceId = ?').run(sourceId);
            db.prepare('DELETE FROM autocomplete_items WHERE sourceId = ?').run(sourceId);
            for (const item of items) {
                const itemId = Number(insertItem.run(
                    sourceId,
                    item.value,
                    JSON.stringify(item.aliases),
                    item.info,
                ).lastInsertRowid);
                insertTerm.run(
                    sourceId,
                    itemId,
                    normalizeAutocompleteText(item.value),
                    item.value,
                    0,
                );
                for (const alias of item.aliases) {
                    insertTerm.run(
                        sourceId,
                        itemId,
                        normalizeAutocompleteText(alias),
                        alias,
                        1,
                    );
                }
            }
            db.prepare(`
                UPDATE autocomplete_sources
                SET itemCount = ?, error = NULL, updatedAt = ?
                WHERE id = ?
            `).run(items.length, Date.now(), sourceId);
        });
        replace();
    }

    static setSourceError(id: string, message: string): void {
        const db = AutocompleteDB.setup();
        const fail = db.transaction(() => {
            db.prepare('DELETE FROM autocomplete_terms WHERE sourceId = ?').run(id);
            db.prepare('DELETE FROM autocomplete_items WHERE sourceId = ?').run(id);
            db.prepare(`
                UPDATE autocomplete_sources
                SET error = ?, itemCount = 0, updatedAt = ?
                WHERE id = ?
            `).run(message, Date.now(), id);
        });
        fail();
    }

    private static searchRows(sourceId: string, query: string, limit: number): SearchRow[] {
        const db = AutocompleteDB.setup();
        const normalized = normalizeAutocompleteText(query);
        const likeNeedle = normalized
            .replaceAll('\\', '\\\\')
            .replaceAll('%', '\\%')
            .replaceAll('_', '\\_');
        if (!normalized) {
            return db.prepare(`
                SELECT i.id AS itemId, i.value AS matchedText, 0 AS matchedAlias,
                       i.value, i.aliases, i.info
                FROM autocomplete_items i
                WHERE i.sourceId = ?
                ORDER BY i.value COLLATE NOCASE ASC
                LIMIT ?
            `).all(sourceId, limit) as SearchRow[];
        }

        if (normalized.length < 3) {
            return db.prepare(`
                SELECT i.id AS itemId, t.matchedText, t.matchedAlias,
                       i.value, i.aliases, i.info
                FROM autocomplete_terms t
                JOIN autocomplete_items i ON i.id = t.itemId
                WHERE t.sourceId = ? AND t.term LIKE ? ESCAPE '\\'
                ORDER BY
                    CASE
                        WHEN t.term = ? THEN 0
                        WHEN t.term LIKE ? ESCAPE '\\' OR t.term LIKE ? ESCAPE '\\' THEN 1
                        ELSE 2
                    END,
                    length(t.term) ASC
                LIMIT ?
            `).all(
                sourceId,
                `%${likeNeedle}%`,
                normalized,
                `${likeNeedle}%`,
                `% ${likeNeedle}%`,
                limit,
            ) as SearchRow[];
        }

        const phrase = `"${normalized.replaceAll('"', '""')}"`;
        return db.prepare(`
            SELECT i.id AS itemId, t.matchedText, t.matchedAlias,
                   i.value, i.aliases, i.info
            FROM autocomplete_terms t
            JOIN autocomplete_items i ON i.id = t.itemId
            WHERE autocomplete_terms MATCH ? AND t.sourceId = ?
            ORDER BY
                CASE
                    WHEN t.term = ? THEN 0
                    WHEN t.term LIKE ? ESCAPE '\\' OR t.term LIKE ? ESCAPE '\\' THEN 1
                    ELSE 2
                END,
                length(t.term) ASC
            LIMIT ?
        `).all(
            phrase,
            sourceId,
            normalized,
            `${likeNeedle}%`,
            `% ${likeNeedle}%`,
            limit,
        ) as SearchRow[];
    }

    static searchSource(
        sourceId: string,
        queries: AutocompleteSearchQuery[],
        limit: number,
    ): AutocompleteMatch[] {
        for (const query of queries) {
            const rows = uniqueSearchRows(
                AutocompleteDB.searchRows(sourceId, query.text, Math.max(limit * 8, 200)),
                query.text,
            );
            if (!rows.length)
                continue;
            return rows
                .map((row): AutocompleteMatch => ({
                    sourceId,
                    value: row.value,
                    aliases: parseAliases(row.aliases),
                    info: row.info,
                    matchedText: row.matchedText,
                    matchedAlias: row.matchedAlias !== 0,
                    query: query.text,
                    replaceStart: query.replaceStart,
                    replaceEnd: query.replaceEnd,
                }))
                .sort(compareAutocompleteMatches)
                .slice(0, limit);
        }
        return [];
    }
}
