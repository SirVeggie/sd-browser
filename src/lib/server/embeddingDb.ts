import type { Database as BetterSqlite3, Statement } from 'better-sqlite3';
import path from 'path';
import { cosineSimilarity, bufferToFloat32Array } from '$lib/tools/vectorMath';
import { datapath } from './paths';
import { openDatabase } from './sqlite';
import { logSearchTiming, startSearchTiming } from './searchTiming';

const META_TABLE = 'embedding_meta';
const VEC_TABLE = 'image_embeddings';
const UNIQUENESS_TABLE = 'uniqueness_scores';
const DIMENSIONS_KEY = 'dimensions';
/** Drop the in-process vector cache after this much idle time. */
const VECTOR_CACHE_IDLE_MS = 60 * 60 * 1000;

export class EmbeddingDimensionMismatchError extends Error {
    readonly expected: number;
    readonly actual: number;

    constructor(expected: number, actual: number) {
        super(
            `Embedding dimension mismatch: expected ${expected}, got ${actual}. `
            + 'Clear embeddings and re-vectorize after changing models.',
        );
        this.name = 'EmbeddingDimensionMismatchError';
        this.expected = expected;
        this.actual = actual;
    }
}

function embeddingToBuffer(embedding: Float32Array): Buffer {
    return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

function assertEmbeddingDimensions(embedding: Float32Array): number {
    if (!embedding.length)
        throw new Error('Embedding vector is empty');
    return embedding.length;
}

/** Copy into an owned Float32Array so the cache does not retain SQLite Buffer memory. */
function ownedFloat32Array(buffer: Buffer): Float32Array {
    const view = bufferToFloat32Array(buffer);
    return new Float32Array(view);
}

function ensureEmbeddingMetaTable(db: BetterSqlite3): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${META_TABLE} (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
}

function readStoredDimensions(db: BetterSqlite3): number | null {
    const row = db.prepare(`SELECT value FROM ${META_TABLE} WHERE key = ?`).get(DIMENSIONS_KEY) as
        | { value: string }
        | undefined;
    if (!row)
        return null;

    const dimensions = Number(row.value);
    if (!Number.isFinite(dimensions) || dimensions <= 0)
        return null;
    return dimensions;
}

function storeDimensions(db: BetterSqlite3, dimensions: number): void {
    db.prepare(`INSERT OR REPLACE INTO ${META_TABLE} (key, value) VALUES (?, ?)`).run(
        DIMENSIONS_KEY,
        String(dimensions),
    );
}

function vecTableExists(db: BetterSqlite3): boolean {
    const row = db.prepare(`
        SELECT 1 AS ok
        FROM sqlite_master
        WHERE name = ? AND type = 'table' AND sql LIKE '%vec0%'
    `).get(VEC_TABLE) as { ok: 1 } | undefined;
    return Boolean(row);
}

function ensureUniquenessTable(db: BetterSqlite3): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${UNIQUENESS_TABLE} (
            id TEXT PRIMARY KEY,
            score REAL NOT NULL
        );
    `);
}

function createVecTable(db: BetterSqlite3, dimensions: number): void {
    if (vecTableExists(db))
        return;

    db.exec(`
        CREATE VIRTUAL TABLE ${VEC_TABLE} USING vec0(
            id TEXT PRIMARY KEY,
            embedding float[${dimensions}] distance_metric=cosine
        );
    `);
}

export class EmbeddingDB {
    private static file = 'embeddings.sqlite3';
    private static isOpen = false;
    private static isSetup = false;
    private static db: BetterSqlite3;
    private static dimensions: number | null = null;

    private static vectorCache: Map<string, Float32Array> | null = null;
    private static vectorCacheLastUsedAt = 0;
    private static vectorCacheIdleTimer: ReturnType<typeof setTimeout> | undefined;

    private static stmtHasImage: Statement<unknown[], unknown> | undefined;
    private static stmtSetImage: Statement<unknown[], unknown> | undefined;
    private static stmtDeleteImage: Statement<unknown[], unknown> | undefined;
    private static stmtSelectAllIds: Statement<unknown[], unknown> | undefined;
    private static stmtSelectAllEmbeddings: Statement<unknown[], unknown> | undefined;
    private static stmtSelectEmbeddingsByIds: Statement<unknown[], unknown> | undefined;
    private static stmtCount: Statement<unknown[], unknown> | undefined;
    private static stmtGetUniquenessScore: Statement<unknown[], unknown> | undefined;
    private static stmtGetUniquenessScoresByIds: Statement<unknown[], unknown> | undefined;
    private static stmtSetUniquenessScore: Statement<unknown[], unknown> | undefined;
    private static stmtDeleteUniquenessScore: Statement<unknown[], unknown> | undefined;
    private static stmtClearUniquenessScores: Statement<unknown[], unknown> | undefined;
    private static stmtCountUniquenessScores: Statement<unknown[], unknown> | undefined;

    private static setup() {
        if (EmbeddingDB.isOpen)
            return;

        EmbeddingDB.isOpen = true;
        const fullpath = path.join(datapath, EmbeddingDB.file);
        EmbeddingDB.db = openDatabase(fullpath, true);

        if (EmbeddingDB.isSetup)
            return;
        EmbeddingDB.isSetup = true;

        ensureEmbeddingMetaTable(EmbeddingDB.db);
        ensureUniquenessTable(EmbeddingDB.db);
        EmbeddingDB.dimensions = readStoredDimensions(EmbeddingDB.db);

        if (EmbeddingDB.dimensions !== null && !vecTableExists(EmbeddingDB.db)) {
            createVecTable(EmbeddingDB.db, EmbeddingDB.dimensions);
        }

        EmbeddingDB.prepareStatements();
    }

    private static vecTableReady(): boolean {
        return EmbeddingDB.dimensions !== null && Boolean(EmbeddingDB.stmtHasImage);
    }

    private static prepareStatements() {
        ensureUniquenessTable(EmbeddingDB.db);
        EmbeddingDB.stmtGetUniquenessScore = EmbeddingDB.db.prepare(
            `SELECT score FROM ${UNIQUENESS_TABLE} WHERE id = ?`,
        );
        EmbeddingDB.stmtGetUniquenessScoresByIds = EmbeddingDB.db.prepare(`
            SELECT id, score
            FROM ${UNIQUENESS_TABLE}
            WHERE id IN (SELECT value FROM json_each(?))
        `);
        EmbeddingDB.stmtSetUniquenessScore = EmbeddingDB.db.prepare(
            `INSERT OR REPLACE INTO ${UNIQUENESS_TABLE} (id, score) VALUES (?, ?)`,
        );
        EmbeddingDB.stmtDeleteUniquenessScore = EmbeddingDB.db.prepare(
            `DELETE FROM ${UNIQUENESS_TABLE} WHERE id = ?`,
        );
        EmbeddingDB.stmtClearUniquenessScores = EmbeddingDB.db.prepare(
            `DELETE FROM ${UNIQUENESS_TABLE}`,
        );
        EmbeddingDB.stmtCountUniquenessScores = EmbeddingDB.db.prepare(
            `SELECT COUNT(*) AS count FROM ${UNIQUENESS_TABLE}`,
        );

        if (!vecTableExists(EmbeddingDB.db)) {
            EmbeddingDB.stmtHasImage = undefined;
            EmbeddingDB.stmtSetImage = undefined;
            EmbeddingDB.stmtDeleteImage = undefined;
            EmbeddingDB.stmtSelectAllIds = undefined;
            EmbeddingDB.stmtSelectAllEmbeddings = undefined;
            EmbeddingDB.stmtSelectEmbeddingsByIds = undefined;
            EmbeddingDB.stmtCount = undefined;
            return;
        }

        EmbeddingDB.stmtHasImage = EmbeddingDB.db.prepare(
            `SELECT 1 FROM ${VEC_TABLE} WHERE id = ? LIMIT 1`,
        );
        EmbeddingDB.stmtSetImage = EmbeddingDB.db.prepare(
            `INSERT INTO ${VEC_TABLE} (id, embedding) VALUES (?, ?)`,
        );
        EmbeddingDB.stmtDeleteImage = EmbeddingDB.db.prepare(
            `DELETE FROM ${VEC_TABLE} WHERE id = ?`,
        );
        EmbeddingDB.stmtSelectAllIds = EmbeddingDB.db.prepare(`SELECT id FROM ${VEC_TABLE}`);
        EmbeddingDB.stmtSelectAllEmbeddings = EmbeddingDB.db.prepare(
            `SELECT id, embedding FROM ${VEC_TABLE}`,
        );
        EmbeddingDB.stmtSelectEmbeddingsByIds = EmbeddingDB.db.prepare(`
            SELECT id, embedding
            FROM ${VEC_TABLE}
            WHERE id IN (SELECT value FROM json_each(?))
        `);
        EmbeddingDB.stmtCount = EmbeddingDB.db.prepare(`SELECT COUNT(*) AS count FROM ${VEC_TABLE}`);
    }

    private static clearVectorCache(): void {
        if (EmbeddingDB.vectorCacheIdleTimer !== undefined) {
            clearTimeout(EmbeddingDB.vectorCacheIdleTimer);
            EmbeddingDB.vectorCacheIdleTimer = undefined;
        }
        EmbeddingDB.vectorCache = null;
        EmbeddingDB.vectorCacheLastUsedAt = 0;
    }

    private static scheduleVectorCacheIdleEviction(): void {
        if (EmbeddingDB.vectorCacheIdleTimer !== undefined)
            clearTimeout(EmbeddingDB.vectorCacheIdleTimer);

        EmbeddingDB.vectorCacheIdleTimer = setTimeout(() => {
            EmbeddingDB.vectorCacheIdleTimer = undefined;
            if (!EmbeddingDB.vectorCache)
                return;
            const idleFor = Date.now() - EmbeddingDB.vectorCacheLastUsedAt;
            if (idleFor < VECTOR_CACHE_IDLE_MS) {
                EmbeddingDB.scheduleVectorCacheIdleEviction();
                return;
            }
            const count = EmbeddingDB.vectorCache.size;
            EmbeddingDB.vectorCache = null;
            EmbeddingDB.vectorCacheLastUsedAt = 0;
            console.log(`[img-timing] EmbeddingDB.vectorCache.evict: idle (${count} vectors)`);
        }, VECTOR_CACHE_IDLE_MS);
        // Allow Node to exit without waiting for the idle timer.
        EmbeddingDB.vectorCacheIdleTimer.unref?.();
    }

    private static touchVectorCache(): void {
        EmbeddingDB.vectorCacheLastUsedAt = Date.now();
        EmbeddingDB.scheduleVectorCacheIdleEviction();
    }

    /**
     * Ensure all embeddings are loaded into process memory for JS scoring.
     * No-op when already warm (updates idle timer).
     */
    private static ensureVectorCache(): Map<string, Float32Array> {
        if (EmbeddingDB.vectorCache) {
            EmbeddingDB.touchVectorCache();
            return EmbeddingDB.vectorCache;
        }

        const startedAt = startSearchTiming();
        if (!EmbeddingDB.stmtSelectAllEmbeddings) {
            EmbeddingDB.vectorCache = new Map();
            EmbeddingDB.touchVectorCache();
            logSearchTiming('EmbeddingDB.vectorCache.load', startedAt, { count: 0 });
            return EmbeddingDB.vectorCache;
        }

        const rows = EmbeddingDB.stmtSelectAllEmbeddings.all() as { id: string; embedding: Buffer }[];
        const cache = new Map<string, Float32Array>();
        for (const row of rows)
            cache.set(row.id, ownedFloat32Array(row.embedding));

        EmbeddingDB.vectorCache = cache;
        EmbeddingDB.touchVectorCache();
        logSearchTiming('EmbeddingDB.vectorCache.load', startedAt, { count: cache.size });
        return cache;
    }

    private static ensureDimensionsForWrite(embedding: Float32Array): void {
        const dimensions = assertEmbeddingDimensions(embedding);

        if (EmbeddingDB.dimensions === null) {
            EmbeddingDB.dimensions = dimensions;
            storeDimensions(EmbeddingDB.db, dimensions);
            createVecTable(EmbeddingDB.db, dimensions);
            EmbeddingDB.prepareStatements();
            return;
        }

        if (dimensions !== EmbeddingDB.dimensions) {
            throw new EmbeddingDimensionMismatchError(EmbeddingDB.dimensions, dimensions);
        }
    }

    private static assertQueryDimensions(query: Float32Array): void {
        const dimensions = assertEmbeddingDimensions(query);
        if (EmbeddingDB.dimensions === null)
            return;
        if (dimensions !== EmbeddingDB.dimensions) {
            throw new EmbeddingDimensionMismatchError(EmbeddingDB.dimensions, dimensions);
        }
    }

    static getDimensions(): number | null {
        EmbeddingDB.setup();
        return EmbeddingDB.dimensions;
    }

    static close() {
        if (!EmbeddingDB.isOpen)
            return;
        EmbeddingDB.clearVectorCache();
        EmbeddingDB.isOpen = false;
        EmbeddingDB.isSetup = false;
        EmbeddingDB.dimensions = null;
        EmbeddingDB.stmtHasImage = undefined;
        EmbeddingDB.stmtSetImage = undefined;
        EmbeddingDB.stmtDeleteImage = undefined;
        EmbeddingDB.stmtSelectAllIds = undefined;
        EmbeddingDB.stmtSelectAllEmbeddings = undefined;
        EmbeddingDB.stmtSelectEmbeddingsByIds = undefined;
        EmbeddingDB.stmtCount = undefined;
        EmbeddingDB.stmtGetUniquenessScore = undefined;
        EmbeddingDB.stmtGetUniquenessScoresByIds = undefined;
        EmbeddingDB.stmtSetUniquenessScore = undefined;
        EmbeddingDB.stmtDeleteUniquenessScore = undefined;
        EmbeddingDB.stmtClearUniquenessScores = undefined;
        EmbeddingDB.stmtCountUniquenessScores = undefined;
        EmbeddingDB.db.close();
    }

    static hasImageEmbedding(id: string): boolean {
        EmbeddingDB.setup();
        if (EmbeddingDB.vectorCache)
            return EmbeddingDB.vectorCache.has(id);
        if (!EmbeddingDB.vecTableReady())
            return false;
        return Boolean(EmbeddingDB.stmtHasImage!.get(id));
    }

    /**
     * When the vector cache is warm, return ids from memory.
     * When cold, use a light DB id select (does not load vectors — for presence-only paths).
     */
    static getAllImageIds(): Set<string> {
        const startedAt = startSearchTiming();
        EmbeddingDB.setup();
        if (EmbeddingDB.vectorCache) {
            EmbeddingDB.touchVectorCache();
            const ids = new Set(EmbeddingDB.vectorCache.keys());
            logSearchTiming('EmbeddingDB.getAllImageIds', startedAt, {
                count: ids.size,
                source: 'cache',
            });
            return ids;
        }
        if (!EmbeddingDB.stmtSelectAllIds)
            return new Set();
        const rows = EmbeddingDB.stmtSelectAllIds.all() as { id: string }[];
        const ids = new Set(rows.map((row) => row.id));
        logSearchTiming('EmbeddingDB.getAllImageIds', startedAt, {
            count: ids.size,
            source: 'db',
        });
        return ids;
    }

    static setImageEmbedding(id: string, embedding: Float32Array) {
        EmbeddingDB.setup();
        EmbeddingDB.ensureDimensionsForWrite(embedding);
        const buffer = embeddingToBuffer(embedding);
        // vec0 does not support INSERT OR REPLACE; delete-then-insert is required for upserts.
        EmbeddingDB.db.transaction(() => {
            EmbeddingDB.stmtDeleteImage!.run(id);
            EmbeddingDB.stmtSetImage!.run(id, buffer);
        }).immediate();

        if (EmbeddingDB.vectorCache) {
            EmbeddingDB.vectorCache.set(id, new Float32Array(embedding));
            EmbeddingDB.touchVectorCache();
        }
    }

    static deleteImage(id: string) {
        EmbeddingDB.setup();
        if (EmbeddingDB.stmtDeleteImage)
            EmbeddingDB.stmtDeleteImage.run(id);
        if (EmbeddingDB.stmtDeleteUniquenessScore)
            EmbeddingDB.stmtDeleteUniquenessScore.run(id);
        if (EmbeddingDB.vectorCache) {
            EmbeddingDB.vectorCache.delete(id);
            EmbeddingDB.touchVectorCache();
        }
        EmbeddingDB.resetIfEmpty();
    }

    static deleteAll(ids: string[]) {
        if (!ids.length)
            return;
        EmbeddingDB.setup();
        if (EmbeddingDB.stmtDeleteImage || EmbeddingDB.stmtDeleteUniquenessScore) {
            EmbeddingDB.db.transaction((imageIds: string[]) => {
                for (const id of imageIds) {
                    EmbeddingDB.stmtDeleteImage?.run(id);
                    EmbeddingDB.stmtDeleteUniquenessScore?.run(id);
                }
            }).immediate(ids);
        }
        if (EmbeddingDB.vectorCache) {
            for (const id of ids)
                EmbeddingDB.vectorCache.delete(id);
            EmbeddingDB.touchVectorCache();
        }
        EmbeddingDB.resetIfEmpty();
    }

    /** Drop stored vectors and dimension metadata when the index is empty (e.g. after a model change). */
    private static resetIfEmpty(): void {
        if (EmbeddingDB.stmtCount) {
            const count = (EmbeddingDB.stmtCount.get() as { count: number }).count;
            if (count > 0)
                return;
        } else if (EmbeddingDB.dimensions === null && !vecTableExists(EmbeddingDB.db)) {
            return;
        }
        EmbeddingDB.resetSchema();
    }

    private static resetSchema(): void {
        EmbeddingDB.clearVectorCache();
        if (vecTableExists(EmbeddingDB.db)) {
            EmbeddingDB.db.exec(`DROP TABLE IF EXISTS ${VEC_TABLE}`);
        }
        EmbeddingDB.db.exec(`DELETE FROM ${UNIQUENESS_TABLE}`);
        EmbeddingDB.db.prepare(`DELETE FROM ${META_TABLE} WHERE key = ?`).run(DIMENSIONS_KEY);
        EmbeddingDB.dimensions = null;
        EmbeddingDB.prepareStatements();
    }

    /**
     * Load embeddings for the given ids. Ensures the in-memory vector cache
     * (used by IMG/MMR/PRUNE scoring paths).
     */
    static getEmbeddingsByIds(ids: string[]): { id: string; embedding: Float32Array }[] {
        EmbeddingDB.setup();
        if (!ids.length)
            return [];

        const cache = EmbeddingDB.ensureVectorCache();
        const result: { id: string; embedding: Float32Array }[] = [];
        for (const id of ids) {
            const embedding = cache.get(id);
            if (embedding)
                result.push({ id, embedding });
        }
        return result;
    }

    static getUniquenessScores(ids: string[]): Map<string, number> {
        EmbeddingDB.setup();
        if (!ids.length || !EmbeddingDB.stmtGetUniquenessScoresByIds)
            return new Map();

        const rows = EmbeddingDB.stmtGetUniquenessScoresByIds.all(
            JSON.stringify(ids),
        ) as { id: string; score: number }[];

        return new Map(rows.map((row) => [row.id, row.score]));
    }

    static getUniquenessIndexCount(): number {
        EmbeddingDB.setup();
        if (!EmbeddingDB.stmtCountUniquenessScores)
            return 0;
        return (EmbeddingDB.stmtCountUniquenessScores.get() as { count: number }).count;
    }

    static replaceAllUniquenessScores(scores: Map<string, number>): void {
        EmbeddingDB.setup();
        if (!EmbeddingDB.stmtClearUniquenessScores || !EmbeddingDB.stmtSetUniquenessScore)
            return;

        EmbeddingDB.db.transaction((entries: [string, number][]) => {
            EmbeddingDB.stmtClearUniquenessScores!.run();
            for (const [id, score] of entries) {
                EmbeddingDB.stmtSetUniquenessScore!.run(id, score);
            }
        }).immediate([...scores.entries()]);
    }

    static findSimilarImage(
        query: Float32Array,
        minSimilarity: number,
        k?: number,
        candidateIds?: Set<string>,
    ): Map<string, number> {
        const startedAt = startSearchTiming();
        EmbeddingDB.setup();
        if (!EmbeddingDB.stmtSelectAllEmbeddings && !EmbeddingDB.vectorCache)
            return new Map();

        EmbeddingDB.assertQueryDimensions(query);

        const cache = EmbeddingDB.ensureVectorCache();
        if (!cache.size)
            return new Map();

        let effectiveCandidates = candidateIds;
        if (effectiveCandidates !== undefined) {
            if (!effectiveCandidates.size)
                return new Map();
            if (effectiveCandidates.size >= cache.size)
                effectiveCandidates = undefined;
        }

        const scoreStartedAt = startSearchTiming();
        const scores: { id: string; similarity: number }[] = [];
        const iterateIds = effectiveCandidates ?? cache.keys();
        let scored = 0;
        for (const id of iterateIds) {
            const embedding = cache.get(id);
            if (!embedding)
                continue;
            scored++;
            const similarity = cosineSimilarity(query, embedding);
            if (similarity >= minSimilarity)
                scores.push({ id, similarity });
        }

        scores.sort((a, b) => b.similarity - a.similarity);
        const limit = k === undefined ? undefined : Math.max(1, k);
        const result = new Map(
            (limit === undefined ? scores : scores.slice(0, limit))
                .map((row) => [row.id, row.similarity]),
        );
        logSearchTiming('EmbeddingDB.findSimilarImage.score', scoreStartedAt, {
            scored,
            matches: result.size,
        });
        logSearchTiming('EmbeddingDB.findSimilarImage', startedAt, {
            path: 'js-cache',
            candidates: effectiveCandidates?.size ?? cache.size,
            matches: result.size,
            k: k ?? 'all',
            minSimilarity,
        });
        return result;
    }
}
