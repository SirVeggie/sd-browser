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
