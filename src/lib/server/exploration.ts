import crypto from 'crypto';
import { similarityPromptText } from "$lib/tools/metadataInterpreter";
import { calcProgress, calcTimeRemaining, updateLine } from "$lib/tools/misc";
import type { ServerImage } from "$lib/types/images";
import { isSimilarityAlgorithm, type ExplorationSettings, type SimilarityAlgorithm } from "$lib/types/misc";
import { buildUniqueHashToId, repairUniqueHashToIdAfterDeletes } from "./explorationUnique";
import { MiscDB } from "./db";

type SourceState = {
    fingerprint: string;
    count: number;
};

type SparseCachePayload = {
    type: 'sparse';
    frequency: number;
    sourceFingerprint: string;
    sourceCount: number;
    poolIds: string[];
};

type SimilarCachePayload = {
    type: 'similar';
    algorithm: SimilarityAlgorithm;
    threshold: number;
    sourceFingerprint: string;
    sourceCount: number;
    poolIds: string[];
};

type UniqueCachePayload = {
    type: 'unique';
    sourceFingerprint: string;
    sourceCount: number;
    hashToId: Record<string, string>;
};

type ExplorationCachePayload = SparseCachePayload | SimilarCachePayload | UniqueCachePayload;

type RuntimeCache<TPayload extends ExplorationCachePayload> = {
    payload: TPayload;
    pool: Set<string>;
};

const sparseCacheKey = 'exploration-cache:sparse';
const similarCacheKey = 'exploration-cache:similar';
const uniqueCacheKey = 'exploration-cache:unique';

let sparseCache: RuntimeCache<SparseCachePayload> | undefined;
let similarCache: RuntimeCache<SimilarCachePayload> | undefined;
let uniqueCache: RuntimeCache<UniqueCachePayload> | undefined;

function getSourceState(images: ServerImage[]): SourceState {
    const ids = images.map(image => image.id).sort();
    const hash = crypto.createHash('sha256');
    for (const id of ids) {
        hash.update(id);
        hash.update('\0');
    }
    return {
        fingerprint: hash.digest('hex'),
        count: ids.length,
    };
}

function sourceMatches(payload: Pick<ExplorationCachePayload, 'sourceFingerprint' | 'sourceCount'>, source: SourceState) {
    return payload.sourceFingerprint === source.fingerprint && payload.sourceCount === source.count;
}

function stringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function parseSparseCache(raw: string | undefined): SparseCachePayload | undefined {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as Partial<SparseCachePayload>;
        if (
            parsed.type === 'sparse' &&
            typeof parsed.frequency === 'number' &&
            typeof parsed.sourceFingerprint === 'string' &&
            typeof parsed.sourceCount === 'number' &&
            stringArray(parsed.poolIds)
        ) {
            return parsed as SparseCachePayload;
        }
    } catch {
        console.log('Failed to parse sparse exploration cache from DB');
    }
    return undefined;
}

function parseSimilarCache(raw: string | undefined): SimilarCachePayload | undefined {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as Partial<SimilarCachePayload>;
        if (
            parsed.type === 'similar' &&
            isSimilarityAlgorithm(parsed.algorithm) &&
            typeof parsed.threshold === 'number' &&
            typeof parsed.sourceFingerprint === 'string' &&
            typeof parsed.sourceCount === 'number' &&
            stringArray(parsed.poolIds)
        ) {
            return parsed as SimilarCachePayload;
        }
    } catch {
        console.log('Failed to parse similar exploration cache from DB');
    }
    return undefined;
}

function isStringRecord(value: unknown): value is Record<string, string> {
    if (!value || typeof value !== 'object')
        return false;
    return Object.entries(value).every(([key, entry]) => typeof key === 'string' && typeof entry === 'string');
}

function parseUniqueCache(raw: string | undefined): UniqueCachePayload | undefined {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as Partial<UniqueCachePayload>;
        if (
            parsed.type === 'unique' &&
            typeof parsed.sourceFingerprint === 'string' &&
            typeof parsed.sourceCount === 'number' &&
            isStringRecord(parsed.hashToId)
        ) {
            return parsed as UniqueCachePayload;
        }
    } catch {
        console.log('Failed to parse unique exploration cache from DB');
    }
    return undefined;
}

function poolIdsAreValid(poolIds: string[], images: ServerImage[]) {
    const ids = new Set(images.map(image => image.id));
    return poolIds.every(id => ids.has(id));
}

function hashToIdAreValid(hashToId: Record<string, string>, images: ServerImage[]) {
    const ids = new Set(images.map(image => image.id));
    return Object.values(hashToId).every(id => ids.has(id));
}

function cachePool<TPayload extends SparseCachePayload | SimilarCachePayload>(payload: TPayload): RuntimeCache<TPayload> {
    return {
        payload,
        pool: new Set(payload.poolIds),
    };
}

function cacheUniquePool(payload: UniqueCachePayload): RuntimeCache<UniqueCachePayload> {
    return {
        payload,
        pool: new Set(Object.values(payload.hashToId)),
    };
}

function saveSparseCache(payload: SparseCachePayload) {
    MiscDB.set(sparseCacheKey, JSON.stringify(payload));
}

function saveSimilarCache(payload: SimilarCachePayload) {
    MiscDB.set(similarCacheKey, JSON.stringify(payload));
}

function saveUniqueCache(payload: UniqueCachePayload) {
    MiscDB.set(uniqueCacheKey, JSON.stringify(payload));
}

export function verifyExplorationCaches(images: ServerImage[]): void {
    const source = getSourceState(images);
    const sparse = parseSparseCache(MiscDB.get(sparseCacheKey));
    if (sparse && !(sourceMatches(sparse, source) && poolIdsAreValid(sparse.poolIds, images))) {
        MiscDB.delete(sparseCacheKey);
        sparseCache = undefined;
    }

    const similar = parseSimilarCache(MiscDB.get(similarCacheKey));
    if (similar && !(sourceMatches(similar, source) && poolIdsAreValid(similar.poolIds, images))) {
        MiscDB.delete(similarCacheKey);
        similarCache = undefined;
    }

    const unique = parseUniqueCache(MiscDB.get(uniqueCacheKey));
    if (unique && sourceMatches(unique, source) && hashToIdAreValid(unique.hashToId, images)) {
        uniqueCache = cacheUniquePool(unique);
    } else {
        if (unique) {
            MiscDB.delete(uniqueCacheKey);
            uniqueCache = undefined;
        }
        const start = Date.now();
        console.log(`Calculating unique exploration cache for ${images.length} images`);
        uniqueCache = buildAndSaveUniqueCache(images);
        console.log(`Calculated unique exploration cache in ${Date.now() - start}ms`);
    }
}

export function invalidateExplorationPools(reason?: string): void {
    sparseCache = undefined;
    similarCache = undefined;
    uniqueCache = undefined;
    void reason;
}

export function recalculateSimilarCache(
    images: ServerImage[],
    algorithm: SimilarityAlgorithm,
    threshold: number,
): Set<string> {
    similarCache = undefined;
    MiscDB.delete(similarCacheKey);
    return getCachedSimilarPool(images, algorithm, threshold);
}

function sortByModifiedDate(images: ServerImage[]): ServerImage[] {
    return [...images].sort((a, b) => {
        if (a.modifiedDate !== b.modifiedDate)
            return a.modifiedDate - b.modifiedDate;
        return a.id.localeCompare(b.id);
    });
}

function firstIndexAtOrAfter(images: ServerImage[], modifiedDate: number): number {
    const index = images.findIndex(image => image.modifiedDate >= modifiedDate);
    return index === -1 ? images.length : index;
}

function getImageMap(images: ServerImage[]): Map<string, ServerImage> {
    return new Map(images.map(image => [image.id, image]));
}

function getSparsePayloadForRepair(): SparseCachePayload | undefined {
    return sparseCache?.payload ?? parseSparseCache(MiscDB.get(sparseCacheKey));
}

function getSimilarPayloadForRepair(): SimilarCachePayload | undefined {
    return similarCache?.payload ?? parseSimilarCache(MiscDB.get(similarCacheKey));
}

function getUniquePayloadForRepair(): UniqueCachePayload | undefined {
    return uniqueCache?.payload ?? parseUniqueCache(MiscDB.get(uniqueCacheKey));
}

function buildAndSaveUniqueCache(images: ServerImage[]): RuntimeCache<UniqueCachePayload> {
    const source = getSourceState(images);
    const payload: UniqueCachePayload = {
        type: 'unique',
        sourceFingerprint: source.fingerprint,
        sourceCount: source.count,
        hashToId: buildUniqueHashToId(images),
    };
    const cached = cacheUniquePool(payload);
    saveUniqueCache(payload);
    return cached;
}

export function repairUniqueCacheOnAdd(images: ServerImage[], added: ServerImage): void {
    if (!added.hash)
        return;

    const existing = getUniquePayloadForRepair();
    if (!existing) {
        uniqueCache = buildAndSaveUniqueCache(images);
        return;
    }

    const source = getSourceState(images);
    const payload: UniqueCachePayload = {
        type: 'unique',
        sourceFingerprint: source.fingerprint,
        sourceCount: source.count,
        hashToId: {
            ...existing.hashToId,
            [added.hash]: added.id,
        },
    };
    uniqueCache = cacheUniquePool(payload);
    saveUniqueCache(payload);
}

export function repairUniqueCacheAfterDeletes(remaining: ServerImage[], deleted: ServerImage[]): void {
    if (!deleted.length)
        return;

    const existing = getUniquePayloadForRepair();
    if (!existing)
        return;

    const source = getSourceState(remaining);
    const payload: UniqueCachePayload = {
        type: 'unique',
        sourceFingerprint: source.fingerprint,
        sourceCount: source.count,
        hashToId: repairUniqueHashToIdAfterDeletes(existing.hashToId, remaining, deleted),
    };
    uniqueCache = cacheUniquePool(payload);
    saveUniqueCache(payload);
}

function repairSparseCache(images: ServerImage[], affectedModifiedDate: number): boolean {
    const existing = getSparsePayloadForRepair();
    if (!existing)
        return false;

    const frequency = Math.max(1, Math.floor(existing.frequency));
    const source = getSourceState(images);
    const sorted = sortByModifiedDate(images);
    const imageMap = getImageMap(images);
    const startIndex = firstIndexAtOrAfter(sorted, affectedModifiedDate);
    const prefixIds = existing.poolIds.filter(id => {
        const image = imageMap.get(id);
        return image !== undefined && image.modifiedDate < affectedModifiedDate;
    });
    const suffixIds: string[] = [];
    for (let i = startIndex; i < sorted.length; i++) {
        if ((i + 1) % frequency === 0)
            suffixIds.push(sorted[i].id);
    }

    const payload: SparseCachePayload = {
        ...existing,
        frequency,
        sourceFingerprint: source.fingerprint,
        sourceCount: source.count,
        poolIds: [...prefixIds, ...suffixIds],
    };
    sparseCache = cachePool(payload);
    saveSparseCache(payload);
    return true;
}

function repairSimilarCache(images: ServerImage[], affectedModifiedDate: number): boolean {
    const existing = getSimilarPayloadForRepair();
    if (!existing)
        return false;

    const source = getSourceState(images);
    const sorted = sortByModifiedDate(images);
    const imageMap = getImageMap(images);
    const selectedPrefix = existing.poolIds
        .map(id => imageMap.get(id))
        .filter((image): image is ServerImage => image !== undefined && image.modifiedDate < affectedModifiedDate)
        .sort((a, b) => {
            if (a.modifiedDate !== b.modifiedDate)
                return a.modifiedDate - b.modifiedDate;
            return a.id.localeCompare(b.id);
        });
    const poolIds = selectedPrefix.map(image => image.id);
    let latestSelectedPrompt = selectedPrefix.length
        ? similarityPromptText(selectedPrefix[selectedPrefix.length - 1])
        : '';
    let startIndex = selectedPrefix.length ? firstIndexAtOrAfter(sorted, affectedModifiedDate) : 0;

    if (!selectedPrefix.length && sorted.length) {
        poolIds.push(sorted[0].id);
        latestSelectedPrompt = similarityPromptText(sorted[0]);
        startIndex = 1;
    }

    for (let i = startIndex; i < sorted.length; i++) {
        const prompt = similarityPromptText(sorted[i]);
        const similarity = computeSimilarity(latestSelectedPrompt, prompt, existing.algorithm);
        if (similarity < existing.threshold) {
            poolIds.push(sorted[i].id);
            latestSelectedPrompt = prompt;
        }
    }

    const payload: SimilarCachePayload = {
        ...existing,
        sourceFingerprint: source.fingerprint,
        sourceCount: source.count,
        poolIds,
    };
    similarCache = cachePool(payload);
    saveSimilarCache(payload);
    return true;
}

export function repairExplorationCaches(images: ServerImage[], affectedModifiedDate: number, reason: string): void {
    repairSparseCache(images, affectedModifiedDate);
    repairSimilarCache(images, affectedModifiedDate);
    void reason;
}

export function getExplorationPool(settings: ExplorationSettings, images: ServerImage[]): Set<string> {

    switch (settings.explorationMode) {
        case 'none':
            return new Set(images.map(image => image.id));
        case 'unique':
            return getCachedUniquePool(images);
        case 'sparse':
            return getCachedSparsePool(images, settings.sparseFrequency);
        case 'similar':
            return getCachedSimilarPool(images, settings.similarityAlgorithm, settings.similarityThreshold);
        default: {
            const _never: never = settings.explorationMode;
            return _never;
        }
    }
}

function getCachedSparsePool(images: ServerImage[], frequency: number): Set<string> {
    const freq = Math.max(1, Math.floor(frequency));
    const source = getSourceState(images);
    if (sparseCache && sparseCache.payload.frequency === freq && sourceMatches(sparseCache.payload, source))
        return sparseCache.pool;

    const persisted = parseSparseCache(MiscDB.get(sparseCacheKey));
    if (persisted && persisted.frequency === freq && sourceMatches(persisted, source) && poolIdsAreValid(persisted.poolIds, images)) {
        sparseCache = cachePool(persisted);
        return sparseCache.pool;
    }

    const start = Date.now();
    console.log(`Calculating sparse exploration cache for ${images.length} images (frequency ${freq})`);
    const pool = buildSparsePool(images, freq);
    const payload: SparseCachePayload = {
        type: 'sparse',
        frequency: freq,
        sourceFingerprint: source.fingerprint,
        sourceCount: source.count,
        poolIds: [...pool],
    };
    sparseCache = cachePool(payload);
    console.log(`Calculated sparse exploration cache in ${Date.now() - start}ms`);
    saveSparseCache(payload);
    return sparseCache.pool;
}

function getCachedSimilarPool(
    images: ServerImage[],
    algorithm: SimilarityAlgorithm,
    threshold: number,
): Set<string> {
    const source = getSourceState(images);
    if (
        similarCache &&
        similarCache.payload.algorithm === algorithm &&
        similarCache.payload.threshold === threshold &&
        sourceMatches(similarCache.payload, source)
    ) {
        return similarCache.pool;
    }

    const persisted = parseSimilarCache(MiscDB.get(similarCacheKey));
    if (
        persisted &&
        persisted.algorithm === algorithm &&
        persisted.threshold === threshold &&
        sourceMatches(persisted, source) &&
        poolIdsAreValid(persisted.poolIds, images)
    ) {
        similarCache = cachePool(persisted);
        return similarCache.pool;
    }

    const start = Date.now();
    const pool = buildSimilarPool(images, algorithm, threshold);
    const payload: SimilarCachePayload = {
        type: 'similar',
        algorithm,
        threshold,
        sourceFingerprint: source.fingerprint,
        sourceCount: source.count,
        poolIds: [...pool],
    };
    similarCache = cachePool(payload);
    console.log(`Calculated similar exploration cache in ${Date.now() - start}ms`);
    saveSimilarCache(payload);
    return similarCache.pool;
}

function getCachedUniquePool(images: ServerImage[]): Set<string> {
    const source = getSourceState(images);
    if (uniqueCache && sourceMatches(uniqueCache.payload, source))
        return uniqueCache.pool;

    const persisted = parseUniqueCache(MiscDB.get(uniqueCacheKey));
    if (persisted && sourceMatches(persisted, source) && hashToIdAreValid(persisted.hashToId, images)) {
        uniqueCache = cacheUniquePool(persisted);
        return uniqueCache.pool;
    }

    const start = Date.now();
    console.log(`Calculating unique exploration cache for ${images.length} images`);
    uniqueCache = buildAndSaveUniqueCache(images);
    console.log(`Calculated unique exploration cache in ${Date.now() - start}ms`);
    return uniqueCache.pool;
}

function buildSparsePool(images: ServerImage[], frequency: number): Set<string> {
    const sorted = sortByModifiedDate(images);
    const pool = new Set<string>();
    const skip = frequency - 1;

    for (let i = skip; i < sorted.length; i += frequency)
        pool.add(sorted[i].id);

    return pool;
}

function buildSimilarPool(
    images: ServerImage[],
    algorithm: SimilarityAlgorithm,
    threshold: number,
): Set<string> {
    const sorted = sortByModifiedDate(images);
    const pool = new Set<string>();
    if (sorted.length === 0)
        return pool;

    const total = sorted.length;
    const log = `Calculating similar exploration cache for ${total} images (${algorithm}, threshold ${threshold})`;
    const tStart = Date.now();
    updateLine(`${log}...`);

    pool.add(sorted[0].id);
    let latestSelectedPrompt = similarityPromptText(sorted[0]);

    for (let i = 1; i < sorted.length; i++) {
        const prompt = similarityPromptText(sorted[i]);
        const similarity = computeSimilarity(latestSelectedPrompt, prompt, algorithm);
        if (similarity < threshold) {
            pool.add(sorted[i].id);
            latestSelectedPrompt = prompt;
        }
        if (i % 1000 === 0 || i === sorted.length - 1)
            updateLine(log + `: ${calcProgress(i + 1, total)}% | estimate: ${calcTimeRemaining(tStart, i + 1, total)}`);
    }

    updateLine('');
    return pool;
}

function tokenize(text: string): string[] {
    return text.toLowerCase().split(/[\s,]+/).filter(Boolean);
}

function countMap(values: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const value of values)
        counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
}

function tokenJaccard(a: string, b: string): number {
    const setA = new Set(tokenize(a));
    const setB = new Set(tokenize(b));
    if (setA.size === 0 && setB.size === 0)
        return 1;
    if (setA.size === 0 || setB.size === 0)
        return 0;

    let intersection = 0;
    for (const token of setA) {
        if (setB.has(token))
            intersection++;
    }
    return intersection / (setA.size + setB.size - intersection);
}

function tokenCosine(a: string, b: string): number {
    const countsA = countMap(tokenize(a));
    const countsB = countMap(tokenize(b));
    if (countsA.size === 0 && countsB.size === 0)
        return 1;
    if (countsA.size === 0 || countsB.size === 0)
        return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const count of countsA.values())
        normA += count * count;
    for (const count of countsB.values())
        normB += count * count;

    for (const [token, countA] of countsA) {
        const countB = countsB.get(token);
        if (countB)
            dot += countA * countB;
    }

    if (normA === 0 || normB === 0)
        return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function computeSimilarity(a: string, b: string, algorithm: SimilarityAlgorithm): number {
    switch (algorithm) {
        case 'token-jaccard':
            return tokenJaccard(a, b);
        case 'token-cosine':
            return tokenCosine(a, b);
        default: {
            const _never: never = algorithm;
            return _never;
        }
    }
}
