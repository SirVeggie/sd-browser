import type { ParsedPruneDirective } from '$lib/tools/searchParsing';
import { selectByTimeNeighbors } from '$lib/tools/mmrMath';
import { EmbeddingDB } from './embeddingDb';
import { getImageList } from './dataIndex';

export type PruneSearchContext = {
    /** Fixed PRUNE result order for this search session. */
    orderedIds: string[];
    error?: string;
};

export function buildPruneSearchContext(
    matchingIds: string[],
    directive: ParsedPruneDirective,
): PruneSearchContext {
    const imageList = getImageList();
    const embeddings = new Map(
        EmbeddingDB.getEmbeddingsByIds(matchingIds).map((row) => [row.id, row.embedding]),
    );

    const dateOrderedCandidates = matchingIds
        .map((id) => {
            const image = imageList.get(id);
            const embedding = embeddings.get(id);
            if (!image || !embedding)
                return undefined;
            return { id, embedding, modifiedDate: image.modifiedDate };
        })
        .filter((candidate): candidate is {
            id: string;
            embedding: Float32Array;
            modifiedDate: number;
        } => candidate !== undefined)
        .sort((left, right) => right.modifiedDate - left.modifiedDate || left.id.localeCompare(right.id));

    if (!dateOrderedCandidates.length) {
        return {
            orderedIds: [],
            error: 'PRUNE requires saved image embeddings for at least one matching image',
        };
    }

    return {
        orderedIds: selectByTimeNeighbors(dateOrderedCandidates, directive.resultCount),
    };
}
