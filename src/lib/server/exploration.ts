import { simplifyPrompt } from "$lib/tools/metadataInterpreter";
import type { ServerImage } from "$lib/types/images";
import type { ExplorationSettings, SimilarityAlgorithm } from "$lib/types/misc";
import { getImageList } from "./filemanager";

type PoolCacheEntry = {
    fingerprint: string;
    pool: Set<string>;
};

const sparseCache = new Map<number, PoolCacheEntry>();
const similarCache = new Map<string, PoolCacheEntry>();
const promptSimplificationVersion = 1;

function libraryFingerprint(images: ServerImage[]): string {
    let maxDate = 0;
    for (const image of images) {
        if (image.modifiedDate > maxDate)
            maxDate = image.modifiedDate;
    }
    return `${images.length}:${maxDate}`;
}

function isCacheValid(entry: PoolCacheEntry | undefined, fingerprint: string): entry is PoolCacheEntry {
    return entry !== undefined && entry.fingerprint === fingerprint;
}

export function invalidateExplorationPools(): void {
    sparseCache.clear();
    similarCache.clear();
}

export function getExplorationPool(settings: ExplorationSettings): Set<string> {
    const images = [...getImageList().values()];

    switch (settings.explorationMode) {
        case 'none':
            return new Set(images.map(image => image.id));
        case 'unique':
            return buildUniquePool(images);
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
    const fingerprint = libraryFingerprint(images);
    const cached = sparseCache.get(freq);
    if (isCacheValid(cached, fingerprint))
        return cached.pool;

    const pool = buildSparsePool(images, freq);
    sparseCache.set(freq, { fingerprint, pool });
    return pool;
}

function getCachedSimilarPool(
    images: ServerImage[],
    algorithm: SimilarityAlgorithm,
    threshold: number,
): Set<string> {
    const key = `${promptSimplificationVersion}:${algorithm}:${threshold}`;
    const fingerprint = libraryFingerprint(images);
    const cached = similarCache.get(key);
    if (isCacheValid(cached, fingerprint))
        return cached.pool;

    const pool = buildSimilarPool(images, algorithm, threshold);
    similarCache.set(key, { fingerprint, pool });
    return pool;
}

function buildUniquePool(images: ServerImage[]): Set<string> {
    const byPrompt = new Map<string, ServerImage>();
    const pool = new Set<string>();

    for (const image of images) {
        const prompt = simplifyPrompt(image);
        if (!prompt) {
            pool.add(image.id);
            continue;
        }

        const existing = byPrompt.get(prompt);
        if (!existing || image.modifiedDate > existing.modifiedDate)
            byPrompt.set(prompt, image);
    }

    for (const image of byPrompt.values())
        pool.add(image.id);

    return pool;
}

function buildSparsePool(images: ServerImage[], frequency: number): Set<string> {
    const sorted = [...images].sort((a, b) => a.modifiedDate - b.modifiedDate);
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
    const sorted = [...images].sort((a, b) => a.modifiedDate - b.modifiedDate);
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

function levenshteinDistance(a: string, b: string): number {
    if (a === b)
        return 0;
    if (a.length === 0)
        return b.length;
    if (b.length === 0)
        return a.length;

    const previous = new Array<number>(b.length + 1);
    const current = new Array<number>(b.length + 1);

    for (let j = 0; j <= b.length; j++)
        previous[j] = j;

    for (let i = 1; i <= a.length; i++) {
        current[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + cost,
            );
        }
        for (let j = 0; j <= b.length; j++)
            previous[j] = current[j];
    }

    return previous[b.length];
}

function normalizedLevenshtein(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0)
        return 1;
    return 1 - (levenshteinDistance(a, b) / maxLen);
}

export function computeSimilarity(a: string, b: string, algorithm: SimilarityAlgorithm): number {
    switch (algorithm) {
        case 'token-jaccard':
            return tokenJaccard(a, b);
        case 'token-cosine':
            return tokenCosine(a, b);
        case 'char-trigram-dice':
            return charTrigramDice(a, b);
        case 'normalized-levenshtein':
            return normalizedLevenshtein(a, b);
        default: {
            const _never: never = algorithm;
            return _never;
        }
    }
}

export function getNewestLibraryImage(): ServerImage | undefined {
    let newest: ServerImage | undefined;
    for (const image of getImageList().values()) {
        if (!newest || image.modifiedDate > newest.modifiedDate)
            newest = image;
    }
    return newest;
}
