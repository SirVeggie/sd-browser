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
