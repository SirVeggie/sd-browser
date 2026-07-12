import type { Database as BetterSqlite3, Statement } from 'better-sqlite3';
import path from 'path';
import { cosineSimilarity, bufferToFloat32Array } from '$lib/tools/vectorMath';
import { datapath } from './paths';
import { openDatabase } from './sqlite';

const META_TABLE = 'embedding_meta';
const VEC_TABLE = 'image_embeddings';
const UNIQUENESS_TABLE = 'uniqueness_scores';
const DIMENSIONS_KEY = 'dimensions';
/** sqlite-vec vec0 KNN hard limit; queries with k above this fail at runtime. */
const VEC0_KNN_MAX = 4096;

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

    private static stmtHasImage: Statement<unknown[], unknown> | undefined;
    private static stmtSetImage: Statement<unknown[], unknown> | undefined;
    private static stmtDeleteImage: Statement<unknown[], unknown> | undefined;
    private static stmtFindSimilar: Statement<unknown[], unknown> | undefined;
    private static stmtFindSimilarIn: Statement<unknown[], unknown> | undefined;
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
            EmbeddingDB.stmtFindSimilar = undefined;
            EmbeddingDB.stmtFindSimilarIn = undefined;
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
        EmbeddingDB.stmtFindSimilar = EmbeddingDB.db.prepare(`
            SELECT id, (1.0 - distance) AS similarity
            FROM ${VEC_TABLE}
            WHERE embedding MATCH ?
              AND k = ?
              AND distance <= ?
            ORDER BY distance
        `);
        EmbeddingDB.stmtFindSimilarIn = EmbeddingDB.db.prepare(`
            SELECT id, (1.0 - distance) AS similarity
            FROM ${VEC_TABLE}
            WHERE embedding MATCH ?
              AND k = ?
              AND distance <= ?
              AND id IN (SELECT value FROM json_each(?))
            ORDER BY distance
        `);
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
        EmbeddingDB.isOpen = false;
        EmbeddingDB.isSetup = false;
        EmbeddingDB.dimensions = null;
        EmbeddingDB.stmtHasImage = undefined;
        EmbeddingDB.stmtSetImage = undefined;
        EmbeddingDB.stmtDeleteImage = undefined;
        EmbeddingDB.stmtFindSimilar = undefined;
        EmbeddingDB.stmtFindSimilarIn = undefined;
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
        if (!EmbeddingDB.vecTableReady())
            return false;
        return Boolean(EmbeddingDB.stmtHasImage!.get(id));
    }

    static getAllImageIds(): Set<string> {
        EmbeddingDB.setup();
        if (!EmbeddingDB.stmtSelectAllIds)
            return new Set();
        const rows = EmbeddingDB.stmtSelectAllIds.all() as { id: string }[];
        return new Set(rows.map((row) => row.id));
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
    }

    static deleteImage(id: string) {
        EmbeddingDB.setup();
        if (EmbeddingDB.stmtDeleteImage)
            EmbeddingDB.stmtDeleteImage.run(id);
        if (EmbeddingDB.stmtDeleteUniquenessScore)
            EmbeddingDB.stmtDeleteUniquenessScore.run(id);
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
        if (vecTableExists(EmbeddingDB.db)) {
            EmbeddingDB.db.exec(`DROP TABLE IF EXISTS ${VEC_TABLE}`);
        }
        EmbeddingDB.db.exec(`DELETE FROM ${UNIQUENESS_TABLE}`);
        EmbeddingDB.db.prepare(`DELETE FROM ${META_TABLE} WHERE key = ?`).run(DIMENSIONS_KEY);
        EmbeddingDB.dimensions = null;
        EmbeddingDB.prepareStatements();
    }

    static getEmbeddingsByIds(ids: string[]): { id: string; embedding: Float32Array }[] {
        EmbeddingDB.setup();
        if (!ids.length || !EmbeddingDB.stmtSelectEmbeddingsByIds)
            return [];

        const rows = EmbeddingDB.stmtSelectEmbeddingsByIds.all(
            JSON.stringify(ids),
        ) as { id: string; embedding: Buffer }[];

        return rows.map((row) => ({
            id: row.id,
            embedding: bufferToFloat32Array(row.embedding),
        }));
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
        useOptimizedQuery = true,
        forceJsSimilarity = false,
    ): Map<string, number> {
        EmbeddingDB.setup();
        if (!EmbeddingDB.stmtFindSimilar)
            return new Map();

        EmbeddingDB.assertQueryDimensions(query);

        const maxDistance = 1 - minSimilarity;
        const queryBuffer = embeddingToBuffer(query);
        const count = (EmbeddingDB.stmtCount!.get() as { count: number }).count;
        if (!count)
            return new Map();

        if (candidateIds !== undefined) {
            if (!candidateIds.size)
                return new Map();
            if (candidateIds.size >= count)
                candidateIds = undefined;
        }

        const requested = k !== undefined ? Math.max(1, k) : Math.max(1, count);
        const useVecQuery = !forceJsSimilarity && (
            (k !== undefined && requested <= VEC0_KNN_MAX)
            || (useOptimizedQuery && k === undefined)
        );
        if (!useVecQuery) {
            return EmbeddingDB.findSimilarImageCandidates(
                query,
                minSimilarity,
                k === undefined ? undefined : requested,
                candidateIds ?? EmbeddingDB.getAllImageIds(),
                count,
            );
        }

        const limit = Math.min(requested, VEC0_KNN_MAX);
        if (candidateIds !== undefined) {
            if (!EmbeddingDB.stmtFindSimilarIn)
                return new Map();
            const rows = EmbeddingDB.stmtFindSimilarIn.all(
                queryBuffer,
                limit,
                maxDistance,
                JSON.stringify([...candidateIds]),
            ) as { id: string; similarity: number }[];
            return new Map(rows.map((row) => [row.id, row.similarity]));
        }

        const rows = EmbeddingDB.stmtFindSimilar.all(
            queryBuffer,
            limit,
            maxDistance,
        ) as { id: string; similarity: number }[];

        return new Map(rows.map((row) => [row.id, row.similarity]));
    }

    private static findSimilarImageCandidates(
        query: Float32Array,
        minSimilarity: number,
        limit: number | undefined,
        candidateIds: Set<string>,
        totalCount: number,
    ): Map<string, number> {
        const rows = EmbeddingDB.getCandidateEmbeddingRows(candidateIds, totalCount);
        const scores: { id: string; similarity: number }[] = [];
        for (const row of rows) {
            if (!candidateIds.has(row.id))
                continue;
            const embedding = bufferToFloat32Array(row.embedding);
            const similarity = cosineSimilarity(query, embedding);
            if (similarity >= minSimilarity)
                scores.push({ id: row.id, similarity });
        }

        scores.sort((a, b) => b.similarity - a.similarity);
        return new Map(
            (limit === undefined ? scores : scores.slice(0, limit))
                .map((row) => [row.id, row.similarity]),
        );
    }

    private static getCandidateEmbeddingRows(
        candidateIds: Set<string>,
        totalCount: number,
    ): { id: string; embedding: Buffer }[] {
        if (candidateIds.size > totalCount / 2) {
            if (!EmbeddingDB.stmtSelectAllEmbeddings)
                return [];
            return EmbeddingDB.stmtSelectAllEmbeddings.all() as { id: string; embedding: Buffer }[];
        }

        if (!EmbeddingDB.stmtSelectEmbeddingsByIds)
            return [];
        return EmbeddingDB.stmtSelectEmbeddingsByIds.all(
            JSON.stringify([...candidateIds]),
        ) as { id: string; embedding: Buffer }[];
    }
}
