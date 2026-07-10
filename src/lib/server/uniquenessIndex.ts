import { computeIntrinsicUniqueness } from '$lib/tools/mmrMath';
import { EmbeddingDB } from './embeddingDb';

export async function buildUniquenessIndex(
    onProgress?: (progress: { done: number; total: number }) => void,
    isAborted?: () => boolean,
): Promise<{ indexed: number }> {
    if (!EmbeddingDB.getDimensions())
        return { indexed: 0 };

    const rows = EmbeddingDB.getEmbeddingsByIds([...EmbeddingDB.getAllImageIds()]);
    const embeddings = new Map(rows.map((row) => [row.id, row.embedding]));
    const total = embeddings.size;

    onProgress?.({ done: 0, total });
    if (!total) {
        EmbeddingDB.replaceAllUniquenessScores(new Map());
        return { indexed: 0 };
    }

    if (isAborted?.())
        throw new Error('Uniqueness index build aborted');

    const scores = computeIntrinsicUniqueness(embeddings);

    if (isAborted?.())
        throw new Error('Uniqueness index build aborted');

    EmbeddingDB.replaceAllUniquenessScores(scores);
    onProgress?.({ done: total, total });

    return { indexed: scores.size };
}
