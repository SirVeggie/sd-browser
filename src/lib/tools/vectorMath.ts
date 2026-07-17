export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const length = Math.min(a.length, b.length);
    for (let index = 0; index < length; index++) {
        const valueA = a[index];
        const valueB = b[index];
        dot += valueA * valueB;
        normA += valueA * valueA;
        normB += valueB * valueB;
    }
    if (!normA || !normB)
        return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function bufferToFloat32Array(buffer: Buffer): Float32Array {
    const floatBytes = Float32Array.BYTES_PER_ELEMENT;
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / floatBytes);
}

export function normalizeEmbedding(values: Float32Array): Float32Array {
    let norm = 0;
    for (let index = 0; index < values.length; index++)
        norm += values[index] * values[index];
    norm = Math.sqrt(norm);
    if (!norm)
        return new Float32Array(values.length);

    const normalized = new Float32Array(values.length);
    for (let index = 0; index < values.length; index++)
        normalized[index] = values[index] / norm;
    return normalized;
}

/** Mean of embeddings, L2-renormalized. Empty input → empty vector. */
export function averageEmbeddings(embeddings: Float32Array[]): Float32Array {
    if (!embeddings.length)
        return new Float32Array();

    const dimensions = embeddings[0].length;
    const sum = new Float32Array(dimensions);
    for (const embedding of embeddings) {
        const length = Math.min(dimensions, embedding.length);
        for (let index = 0; index < length; index++)
            sum[index] += embedding[index];
    }

    const scale = 1 / embeddings.length;
    for (let index = 0; index < dimensions; index++)
        sum[index] *= scale;

    return normalizeEmbedding(sum);
}

/**
 * Extrapolate past A away from B: normalize(A + α(A − B)).
 * α = 1 steps the same distance again beyond A.
 */
export function extrapolateEmbedding(
    embeddingA: Float32Array,
    embeddingB: Float32Array,
    alpha = 1,
): Float32Array {
    const length = Math.min(embeddingA.length, embeddingB.length);
    const result = new Float32Array(length);
    for (let index = 0; index < length; index++) {
        const valueA = embeddingA[index];
        result[index] = valueA + alpha * (valueA - embeddingB[index]);
    }
    return normalizeEmbedding(result);
}

export function geometricMeanPositive(values: number[]): number {
    if (!values.length)
        return 1;
    if (values.some((value) => value <= 0))
        return 0;

    const logSum = values.reduce((total, value) => total + Math.log(value), 0);
    return Math.exp(logSum / values.length);
}

export function clampUnitScore(score: number): number {
    if (score <= 0)
        return 0;
    if (score >= 1)
        return 1;
    return score;
}

/** Soft intersection: geometric mean of cosine similarities to each reference. */
export function scoreImgAllMode(
    refEmbeddings: Float32Array[],
    candidate: Float32Array,
): number {
    const similarities = refEmbeddings.map((ref) =>
        clampUnitScore(cosineSimilarity(ref, candidate)));
    return geometricMeanPositive(similarities);
}

/** Soft union: max cosine similarity to any reference. */
export function scoreImgAnyMode(
    refEmbeddings: Float32Array[],
    candidate: Float32Array,
): number {
    let best = 0;
    for (const ref of refEmbeddings) {
        const similarity = clampUnitScore(cosineSimilarity(ref, candidate));
        if (similarity > best)
            best = similarity;
    }
    return best;
}

/**
 * Related to the set but atypical vs the centroid:
 * maxSim(refs) * (1 − sim(centroid)).
 */
export function scoreImgFringeMode(
    refEmbeddings: Float32Array[],
    centroid: Float32Array,
    candidate: Float32Array,
): number {
    const relatedness = scoreImgAnyMode(refEmbeddings, candidate);
    const centrality = clampUnitScore(cosineSimilarity(centroid, candidate));
    return relatedness * (1 - centrality);
}

/** Difference / residual direction: normalize(A − B). */
export function differenceEmbedding(
    embeddingA: Float32Array,
    embeddingB: Float32Array,
): Float32Array {
    const length = Math.min(embeddingA.length, embeddingB.length);
    const result = new Float32Array(length);
    for (let index = 0; index < length; index++)
        result[index] = embeddingA[index] - embeddingB[index];
    return normalizeEmbedding(result);
}

/** Analogy A:B :: C:? → normalize(C + (B − A)). */
export function analogyEmbedding(
    embeddingA: Float32Array,
    embeddingB: Float32Array,
    embeddingC: Float32Array,
): Float32Array {
    const length = Math.min(embeddingA.length, embeddingB.length, embeddingC.length);
    const result = new Float32Array(length);
    for (let index = 0; index < length; index++)
        result[index] = embeddingC[index] + (embeddingB[index] - embeddingA[index]);
    return normalizeEmbedding(result);
}

/**
 * Shared-subspace query: mean embedding with high within-set variance dims
 * downweighted via inverse-variance relative to median(var).
 * Using (1+var) is a no-op on L2-normalized high-d embeddings (var ≪ 1).
 */
export function sharedSubspaceEmbedding(embeddings: Float32Array[]): Float32Array {
    if (!embeddings.length)
        return new Float32Array();
    if (embeddings.length === 1)
        return normalizeEmbedding(new Float32Array(embeddings[0]));

    const dimensions = embeddings[0].length;
    const mean = new Float32Array(dimensions);
    for (const embedding of embeddings) {
        const length = Math.min(dimensions, embedding.length);
        for (let index = 0; index < length; index++)
            mean[index] += embedding[index];
    }
    const invN = 1 / embeddings.length;
    for (let index = 0; index < dimensions; index++)
        mean[index] *= invN;

    const variance = new Float32Array(dimensions);
    for (const embedding of embeddings) {
        const length = Math.min(dimensions, embedding.length);
        for (let index = 0; index < length; index++) {
            const delta = embedding[index] - mean[index];
            variance[index] += delta * delta;
        }
    }
    for (let index = 0; index < dimensions; index++)
        variance[index] *= invN;

    const sortedVariance = Float32Array.from(variance);
    sortedVariance.sort();
    const medianVariance = sortedVariance[Math.floor(dimensions / 2)];
    const epsilon = Math.max(medianVariance, Number.EPSILON);

    const query = new Float32Array(dimensions);
    for (let index = 0; index < dimensions; index++)
        query[index] = mean[index] / (variance[index] + epsilon);

    return normalizeEmbedding(query);
}

/** Spread penalty weight for affinity: score = μ / (1 + λσ). */
export const IMG_AFFINITY_CONSISTENCY_LAMBDA = 1;

/**
 * Set membership via mean similarity to refs, penalizing uneven match:
 * clamp(μ / (1 + λσ)). Prefers collection fits over one-ref specialists.
 */
export function scoreImgAffinityMode(
    refEmbeddings: Float32Array[],
    candidate: Float32Array,
    lambda = IMG_AFFINITY_CONSISTENCY_LAMBDA,
): number {
    if (!refEmbeddings.length)
        return 0;
    if (refEmbeddings.length === 1)
        return clampUnitScore(cosineSimilarity(refEmbeddings[0], candidate));

    const count = refEmbeddings.length;
    const similarities = new Array<number>(count);
    let sum = 0;
    for (let index = 0; index < count; index++) {
        const similarity = clampUnitScore(cosineSimilarity(refEmbeddings[index], candidate));
        similarities[index] = similarity;
        sum += similarity;
    }

    const mean = sum / count;
    let varianceSum = 0;
    for (let index = 0; index < count; index++) {
        const delta = similarities[index] - mean;
        varianceSum += delta * delta;
    }
    const stdev = Math.sqrt(varianceSum / count);
    return clampUnitScore(mean / (1 + lambda * stdev));
}
