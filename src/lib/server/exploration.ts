import crypto from 'crypto';
import { simplifyPrompt } from "$lib/tools/metadataInterpreter";
import type { ServerImage } from "$lib/types/images";
import { isSimilarityAlgorithm, type ExplorationSettings, type SimilarityAlgorithm } from "$lib/types/misc";
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

type RuntimeCache<TPayload extends SparseCachePayload | SimilarCachePayload> = {
    payload: TPayload;
    pool: Set<string>;
};

const sparseCacheKey = 'exploration-cache:sparse';
const similarCacheKey = 'exploration-cache:similar';

let sparseCache: RuntimeCache<SparseCachePayload> | undefined;
let similarCache: RuntimeCache<SimilarCachePayload> | undefined;

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

function sourceMatches(payload: SparseCachePayload | SimilarCachePayload, source: SourceState) {
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

function poolIdsAreValid(poolIds: string[], images: ServerImage[]) {
    const ids = new Set(images.map(image => image.id));
    return poolIds.every(id => ids.has(id));
}

function cachePool<TPayload extends SparseCachePayload | SimilarCachePayload>(payload: TPayload): RuntimeCache<TPayload> {
    return {
        payload,
        pool: new Set(payload.poolIds),
    };
}

function saveSparseCache(payload: SparseCachePayload) {
    MiscDB.set(sparseCacheKey, JSON.stringify(payload));
    console.log(`Saved sparse exploration cache (${payload.poolIds.length}/${payload.sourceCount} images, frequency ${payload.frequency})`);
}

function saveSimilarCache(payload: SimilarCachePayload) {
    MiscDB.set(similarCacheKey, JSON.stringify(payload));
    console.log(`Saved similar exploration cache (${payload.poolIds.length}/${payload.sourceCount} images, ${payload.algorithm}, threshold ${payload.threshold})`);
}

export function verifyExplorationCaches(images: ServerImage[]): void {
    const source = getSourceState(images);
    const sparse = parseSparseCache(MiscDB.get(sparseCacheKey));
    if (sparse && sourceMatches(sparse, source) && poolIdsAreValid(sparse.poolIds, images)) {
        console.log(`Verified sparse exploration cache (${sparse.poolIds.length}/${source.count} images)`);
    } else if (sparse) {
        MiscDB.delete(sparseCacheKey);
        sparseCache = undefined;
        console.log('Removed stale sparse exploration cache after library verification');
    }

    const similar = parseSimilarCache(MiscDB.get(similarCacheKey));
    if (similar && sourceMatches(similar, source) && poolIdsAreValid(similar.poolIds, images)) {
        console.log(`Verified similar exploration cache (${similar.poolIds.length}/${source.count} images)`);
    } else if (similar) {
        MiscDB.delete(similarCacheKey);
        similarCache = undefined;
        console.log('Removed stale similar exploration cache after library verification');
    }
}

export function invalidateExplorationPools(reason?: string): void {
    const hadCache = !!sparseCache || !!similarCache;
    sparseCache = undefined;
    similarCache = undefined;
    if (hadCache || reason)
        console.log(`Cleared exploration runtime caches${reason ? `: ${reason}` : ''}`);
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
    console.log(`Repaired sparse exploration cache from modified date ${affectedModifiedDate}`);
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
        ? simplifyPrompt(selectedPrefix[selectedPrefix.length - 1])
        : '';
    let startIndex = selectedPrefix.length ? firstIndexAtOrAfter(sorted, affectedModifiedDate) : 0;

    if (!selectedPrefix.length && sorted.length) {
        poolIds.push(sorted[0].id);
        latestSelectedPrompt = simplifyPrompt(sorted[0]);
        startIndex = 1;
    }

    for (let i = startIndex; i < sorted.length; i++) {
        const prompt = simplifyPrompt(sorted[i]);
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
    console.log(`Repaired similar exploration cache from modified date ${affectedModifiedDate}`);
    return true;
}

export function repairExplorationCaches(images: ServerImage[], affectedModifiedDate: number, reason: string): void {
    const repairedSparse = repairSparseCache(images, affectedModifiedDate);
    const repairedSimilar = repairSimilarCache(images, affectedModifiedDate);
    if (repairedSparse || repairedSimilar)
        console.log(`Repaired exploration caches from modified date ${affectedModifiedDate}: ${reason}`);
}

export function getExplorationPool(settings: ExplorationSettings, images: ServerImage[]): Set<string> {

    switch (settings.explorationMode) {
        case 'none':
            return new Set(images.map(image => image.id));
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
        console.log(`Loaded sparse exploration cache from DB (${persisted.poolIds.length}/${source.count} images, frequency ${freq})`);
        return sparseCache.pool;
    }

    if (persisted)
        console.log('Sparse exploration cache is stale or settings changed; recalculating');

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
        console.log(`Loaded similar exploration cache from DB (${persisted.poolIds.length}/${source.count} images, ${algorithm}, threshold ${threshold})`);
        return similarCache.pool;
    }

    if (persisted)
        console.log('Similar exploration cache is stale or settings changed; recalculating');

    const start = Date.now();
    console.log(`Calculating similar exploration cache for ${images.length} images (${algorithm}, threshold ${threshold})`);
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

    pool.add(sorted[0].id);
    let latestSelectedPrompt = simplifyPrompt(sorted[0]);

    for (let i = 1; i < sorted.length; i++) {
        const prompt = simplifyPrompt(sorted[i]);
        const similarity = computeSimilarity(latestSelectedPrompt, prompt, algorithm);
        if (similarity < threshold) {
            pool.add(sorted[i].id);
            latestSelectedPrompt = prompt;
        }
    }

    return pool;
}

function tokenize(text: string): string[] {
    return text.toLowerCase().split(/[\s,]+/).filter(Boolean);
}

function getTrigrams(text: string): string[] {
    const normalized = text.toLowerCase();
    if (normalized.length === 0)
        return [];
    const padded = `  ${normalized} `;
    const trigrams: string[] = [];
    for (let i = 0; i < padded.length - 2; i++)
        trigrams.push(padded.slice(i, i + 3));
    return trigrams;
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

function charTrigramDice(a: string, b: string): number {
    const trigramsA = getTrigrams(a);
    const trigramsB = getTrigrams(b);
    if (trigramsA.length === 0 && trigramsB.length === 0)
        return 1;
    if (trigramsA.length === 0 || trigramsB.length === 0)
        return 0;

    const countsA = countMap(trigramsA);
    const countsB = countMap(trigramsB);
    let intersection = 0;

    for (const [trigram, countA] of countsA) {
        const countB = countsB.get(trigram);
        if (countB)
            intersection += Math.min(countA, countB);
    }

    const total = trigramsA.length + trigramsB.length;
    return (2 * intersection) / total;
}

export function computeSimilarity(a: string, b: string, algorithm: SimilarityAlgorithm): number {
    switch (algorithm) {
        case 'token-jaccard':
            return tokenJaccard(a, b);
        case 'token-cosine':
            return tokenCosine(a, b);
        case 'char-trigram-dice':
            return charTrigramDice(a, b);
        default: {
            const _never: never = algorithm;
            return _never;
        }
    }
}
