import crypto from 'crypto';
import { similarityPromptText } from "$lib/tools/metadataInterpreter";
import { calcProgress, calcTimeRemaining, updateLine } from "$lib/tools/misc";
import type { ServerImage } from "$lib/types/images";
import { isSimilarityAlgorithm, type ExplorationSettings, type SimilarityAlgorithm } from "$lib/types/misc";
import { buildUniqueHashToId, repairUniqueHashToIdAfterDeletesInPlace } from "./explorationUnique";
import { MiscDB } from "./db";
import { getImageList } from "./dataIndex";

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
    /** sourceGeneration this cache was last brought up to date with. */
    generation: number;
};

type PendingUniqueOp =
    | { type: 'add'; image: ServerImage }
    | { type: 'delete'; images: ServerImage[] };

const sparseCacheKey = 'exploration-cache:sparse';
const similarCacheKey = 'exploration-cache:similar';
const uniqueCacheKey = 'exploration-cache:unique';

/** Repairs wait this long after the last image change unless a search needs a pool first. */
const REPAIR_IDLE_MS = 10_000;
/** Persisting the caches (MBs of JSON) waits for a longer quiet period. */
const PERSIST_IDLE_MS = 30_000;

let sparseCache: RuntimeCache<SparseCachePayload> | undefined;
let similarCache: RuntimeCache<SimilarCachePayload> | undefined;
let uniqueCache: RuntimeCache<UniqueCachePayload> | undefined;

/**
 * Bumped on every image add/delete/move reported here, so runtime caches can be
 * checked in O(1) instead of re-hashing every id. Persisted payloads still carry
 * the full fingerprint, computed when they are saved.
 */
let sourceGeneration = 0;
let pendingUniqueOps: PendingUniqueOp[] = [];
let pendingAffectedDate = Number.POSITIVE_INFINITY;
let repairTimer: ReturnType<typeof setTimeout> | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
const dirtyPersist = new Set<'sparse' | 'similar' | 'unique'>();

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
        generation: sourceGeneration,
    };
}

function cacheUniquePool(payload: UniqueCachePayload): RuntimeCache<UniqueCachePayload> {
    return {
        payload,
        pool: new Set(Object.values(payload.hashToId)),
        generation: sourceGeneration,
    };
}

function runtimeCacheIsCurrent(cache: RuntimeCache<ExplorationCachePayload> | undefined, images: ServerImage[]): boolean {
    return cache !== undefined
        && cache.generation === sourceGeneration
        && cache.payload.sourceCount === images.length;
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
    clearPendingRepairs();
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
    clearPendingRepairs();
    sourceGeneration++;
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
    flushExplorationRepairs(images);
    similarCache = undefined;
    dirtyPersist.delete('similar');
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

/**
 * Queue a unique-cache repair for an added image. The `images` argument is kept for
 * callers; the repair runs later against the image list at that time.
 */
export function repairUniqueCacheOnAdd(images: ServerImage[], added: ServerImage): void {
    void images;
    sourceGeneration++;
    if (added.hash)
        pendingUniqueOps.push({ type: 'add', image: added });
    scheduleRepair();
}

/** Queue a unique-cache repair for deleted images (see repairUniqueCacheOnAdd). */
export function repairUniqueCacheAfterDeletes(remaining: ServerImage[], deleted: ServerImage[]): void {
    void remaining;
    sourceGeneration++;
    if (deleted.length)
        pendingUniqueOps.push({ type: 'delete', images: deleted });
    scheduleRepair();
}

function applyUniqueOps(images: ServerImage[], ops: PendingUniqueOp[]): void {
    const existing = getUniquePayloadForRepair();
    if (!existing) {
        if (ops.some(op => op.type === 'add')) {
            uniqueCache = buildAndSaveUniqueCache(images);
            dirtyPersist.delete('unique');
        }
        return;
    }

    // Mutate in place: copying a 100k+ entry record per image was the main cost.
    const hashToId = existing.hashToId;
    const pool = uniqueCache?.payload === existing
        ? uniqueCache.pool
        : new Set(Object.values(hashToId));
    for (const op of ops) {
        if (op.type === 'add') {
            const hash = op.image.hash;
            if (!hash)
                continue;
            const previous = hashToId[hash];
            if (previous && previous !== op.image.id)
                pool.delete(previous);
            hashToId[hash] = op.image.id;
            pool.add(op.image.id);
        } else {
            repairUniqueHashToIdAfterDeletesInPlace(hashToId, images, op.images, pool);
        }
    }
    existing.sourceCount = images.length;
    uniqueCache = { payload: existing, pool, generation: sourceGeneration };
    dirtyPersist.add('unique');
}

function clearPendingRepairs(): void {
    clearTimeout(repairTimer);
    repairTimer = undefined;
    pendingUniqueOps = [];
    pendingAffectedDate = Number.POSITIVE_INFINITY;
}

function scheduleRepair(): void {
    clearTimeout(repairTimer);
    repairTimer = setTimeout(() => flushExplorationRepairs(), REPAIR_IDLE_MS);
}

function schedulePersist(): void {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistExplorationCaches, PERSIST_IDLE_MS);
}

/** Apply queued add/delete/move repairs to the in-memory caches in one pass. */
export function flushExplorationRepairs(images: ServerImage[] = [...getImageList().values()]): void {
    const ops = pendingUniqueOps;
    const affectedDate = pendingAffectedDate;
    clearPendingRepairs();
    if (!ops.length && affectedDate === Number.POSITIVE_INFINITY) {
        refreshCacheGenerations(images);
        return;
    }

    const start = performance.now();
    if (ops.length)
        applyUniqueOps(images, ops);
    if (affectedDate !== Number.POSITIVE_INFINITY) {
        repairSparseCache(images, affectedDate);
        repairSimilarCache(images, affectedDate);
    }
    refreshCacheGenerations(images);
    const ms = performance.now() - start;
    if (ms > 50)
        console.log(`Repaired exploration caches (${ops.length} changes) in ${Math.round(ms)}ms`);
    if (dirtyPersist.size)
        schedulePersist();
}

/** A change that touched no pool (e.g. an image without a prompt hash) still bumps the generation. */
function refreshCacheGenerations(images: ServerImage[]): void {
    for (const cache of [sparseCache, similarCache, uniqueCache]) {
        if (!cache || cache.generation === sourceGeneration)
            continue;
        cache.generation = sourceGeneration;
        if (cache.payload.sourceCount !== images.length) {
            cache.payload.sourceCount = images.length;
            dirtyPersist.add(cache.payload.type);
        }
    }
}

function persistExplorationCaches(): void {
    persistTimer = undefined;
    if (pendingUniqueOps.length || pendingAffectedDate !== Number.POSITIVE_INFINITY) {
        // Still changing: persist after the next repair settles.
        return;
    }
    if (!dirtyPersist.size)
        return;
    const start = performance.now();
    const source = getSourceState([...getImageList().values()]);
    for (const type of dirtyPersist) {
        const cache = type === 'sparse' ? sparseCache : type === 'similar' ? similarCache : uniqueCache;
        if (!cache)
            continue;
        cache.payload.sourceFingerprint = source.fingerprint;
        cache.payload.sourceCount = source.count;
        MiscDB.set(cacheKeyFor(type), JSON.stringify(cache.payload));
    }
    dirtyPersist.clear();
    console.log(`Saved exploration caches in ${Math.round(performance.now() - start)}ms`);
}

function cacheKeyFor(type: ExplorationCachePayload['type']): string {
    switch (type) {
        case 'sparse': return sparseCacheKey;
        case 'similar': return similarCacheKey;
        case 'unique': return uniqueCacheKey;
    }
}

function repairSparseCache(images: ServerImage[], affectedModifiedDate: number): boolean {
    const existing = getSparsePayloadForRepair();
    if (!existing)
        return false;

    const frequency = Math.max(1, Math.floor(existing.frequency));
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
        sourceCount: images.length,
        poolIds: [...prefixIds, ...suffixIds],
    };
    sparseCache = cachePool(payload);
    dirtyPersist.add('sparse');
    return true;
}

function repairSimilarCache(images: ServerImage[], affectedModifiedDate: number): boolean {
    const existing = getSimilarPayloadForRepair();
    if (!existing)
        return false;

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
        sourceCount: images.length,
        poolIds,
    };
    similarCache = cachePool(payload);
    dirtyPersist.add('similar');
    return true;
}

/** Queue a sparse/similar repair from `affectedModifiedDate` on (see repairUniqueCacheOnAdd). */
export function repairExplorationCaches(images: ServerImage[], affectedModifiedDate: number, reason: string): void {
    void images;
    void reason;
    sourceGeneration++;
    pendingAffectedDate = Math.min(pendingAffectedDate, affectedModifiedDate);
    scheduleRepair();
}

export function getExplorationPool(settings: ExplorationSettings, images: ServerImage[]): Set<string> {
    if (settings.explorationMode !== 'none' && (pendingUniqueOps.length || pendingAffectedDate !== Number.POSITIVE_INFINITY))
        flushExplorationRepairs(images);

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
    if (sparseCache && sparseCache.payload.frequency === freq && runtimeCacheIsCurrent(sparseCache, images))
        return sparseCache.pool;

    const source = getSourceState(images);
    if (sparseCache && sparseCache.payload.frequency === freq && sourceMatches(sparseCache.payload, source)) {
        sparseCache.generation = sourceGeneration;
        return sparseCache.pool;
    }

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
    const settingsMatch = similarCache !== undefined
        && similarCache.payload.algorithm === algorithm
        && similarCache.payload.threshold === threshold;
    if (settingsMatch && runtimeCacheIsCurrent(similarCache, images))
        return similarCache!.pool;

    const source = getSourceState(images);
    if (settingsMatch && sourceMatches(similarCache!.payload, source)) {
        similarCache!.generation = sourceGeneration;
        return similarCache!.pool;
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
    if (runtimeCacheIsCurrent(uniqueCache, images))
        return uniqueCache!.pool;

    const source = getSourceState(images);
    if (uniqueCache && sourceMatches(uniqueCache.payload, source)) {
        uniqueCache.generation = sourceGeneration;
        return uniqueCache.pool;
    }

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
