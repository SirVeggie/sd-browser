import type { ServerImage } from '$lib/types/images';
import type { MmrCandidatePoolStrategy, MmrSettings } from '$lib/types/mmr';
import type { ParsedMmrDirective } from '$lib/tools/searchParsing';
import {
    computeIntrinsicUniqueness,
    rankMmrFromEmbeddings,
} from '$lib/tools/mmrMath';
import { EmbeddingDB } from './embeddingDb';
import { getImageList } from './dataIndex';

export type MmrSearchContext = {
    /** Fixed MMR result order for this search session. */
    orderedIds: string[];
    /** Intrinsic uniqueness score (distance to nearest neighbor) per image. */
    uniquenessScores: Map<string, number>;
    error?: string;
};

function loadEmbeddings(ids: Iterable<string>): Map<string, Float32Array> {
    const rows = EmbeddingDB.getEmbeddingsByIds([...ids]);
    return new Map(rows.map((row) => [row.id, row.embedding]));
}

function selectEvenlyByDate(images: ServerImage[], count: number): string[] {
    if (!images.length)
        return [];
    if (images.length <= count)
        return images.map((image) => image.id);

    const sorted = [...images].sort((a, b) => b.modifiedDate - a.modifiedDate);
    const selected: string[] = [];
    const seen = new Set<string>();
    const step = (sorted.length - 1) / Math.max(1, count - 1);

    for (let index = 0; index < count; index++) {
        const image = sorted[Math.min(sorted.length - 1, Math.round(index * step))];
        if (!seen.has(image.id)) {
            selected.push(image.id);
            seen.add(image.id);
        }
    }

    if (selected.length < count) {
        for (const image of sorted) {
            if (selected.length >= count)
                break;
            if (seen.has(image.id))
                continue;
            selected.push(image.id);
            seen.add(image.id);
        }
    }

    return selected;
}

function selectByUniquenessIndex(matchingIds: string[], count: number): string[] {
    const scores = EmbeddingDB.getUniquenessScores(matchingIds);
    const withScore: { id: string; score: number }[] = [];
    const withoutScore: string[] = [];

    for (const id of matchingIds) {
        const score = scores.get(id);
        if (score === undefined)
            withoutScore.push(id);
        else
            withScore.push({ id, score });
    }

    withScore.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const selected = withScore.slice(0, count).map((entry) => entry.id);
    if (selected.length < count)
        selected.push(...withoutScore.slice(0, count - selected.length));
    return selected;
}

function selectByPreRank(matchingIds: string[], count: number): string[] {
    const embeddings = loadEmbeddings(matchingIds);
    if (!embeddings.size)
        return [];

    const uniqueness = computeIntrinsicUniqueness(embeddings);
    return [...uniqueness.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, count)
        .map(([id]) => id);
}

export function selectMmrCandidatePool(
    matchingIds: string[],
    candidateCount: number,
    strategy: MmrCandidatePoolStrategy,
): string[] {
    const imageList = getImageList();
    const matchingImages = matchingIds
        .map((id) => imageList.get(id))
        .filter((image): image is ServerImage => !!image);

    switch (strategy) {
        case 'n-select':
            return selectEvenlyByDate(matchingImages, candidateCount);
        case 'index':
            return selectByUniquenessIndex(matchingIds, candidateCount);
        case 'pre-rank':
            return selectByPreRank(matchingIds, candidateCount);
        default: {
            const _never: never = strategy;
            return _never;
        }
    }
}

export function rankMmrResults(
    candidateIds: string[],
    directive: ParsedMmrDirective,
    settings: MmrSettings,
): MmrSearchContext {
    const embeddings = loadEmbeddings(candidateIds);
    if (!embeddings.size) {
        return {
            orderedIds: [],
            uniquenessScores: new Map(),
            error: 'MMR requires saved image embeddings for at least one matching image',
        };
    }

    const result = rankMmrFromEmbeddings(candidateIds, embeddings, directive, settings);
    return {
        orderedIds: result.orderedIds,
        uniquenessScores: result.uniquenessScores,
    };
}

export function buildMmrSearchContext(
    matchingIds: string[],
    directive: ParsedMmrDirective,
    settings: MmrSettings,
): MmrSearchContext {
    const candidatePool = selectMmrCandidatePool(
        matchingIds,
        directive.candidateCount,
        settings.candidatePoolStrategy,
    );

    if (!candidatePool.length) {
        return {
            orderedIds: [],
            uniquenessScores: new Map(),
            error: 'MMR found no embedded matching images',
        };
    }

    return rankMmrResults(candidatePool, directive, settings);
}

export { computeIntrinsicUniqueness } from '$lib/tools/mmrMath';
