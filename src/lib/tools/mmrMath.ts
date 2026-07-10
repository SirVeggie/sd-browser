import type { MmrSettings } from '../types/mmr';
import type { ParsedMmrDirective } from './searchParsing';

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
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

type TimeNeighborCandidate = {
    id: string;
    embedding: Float32Array;
};

type TimeNeighborNode = {
    id: string;
    embedding: Float32Array;
    previous?: number;
    next?: number;
    active: boolean;
    version: number;
};

type TimeNeighborHeapEntry = {
    index: number;
    score: number;
    version: number;
};

function compareTimeNeighborHeapEntries(
    left: TimeNeighborHeapEntry,
    right: TimeNeighborHeapEntry,
): number {
    if (left.score !== right.score)
        return left.score - right.score;
    return left.index - right.index;
}

class TimeNeighborMinHeap {
    private entries: TimeNeighborHeapEntry[] = [];

    push(entry: TimeNeighborHeapEntry): void {
        this.entries.push(entry);
        let index = this.entries.length - 1;
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            const parent = this.entries[parentIndex];
            if (compareTimeNeighborHeapEntries(parent, entry) <= 0)
                break;
            this.entries[index] = parent;
            index = parentIndex;
        }
        this.entries[index] = entry;
    }

    pop(): TimeNeighborHeapEntry | undefined {
        const first = this.entries[0];
        const last = this.entries.pop();
        if (!first || !last)
            return first;
        if (!this.entries.length)
            return first;

        let index = 0;
        while (true) {
            const leftIndex = index * 2 + 1;
            const rightIndex = leftIndex + 1;
            if (leftIndex >= this.entries.length)
                break;

            const childIndex = rightIndex < this.entries.length
                && compareTimeNeighborHeapEntries(this.entries[rightIndex], this.entries[leftIndex]) < 0
                ? rightIndex
                : leftIndex;
            const child = this.entries[childIndex];
            if (compareTimeNeighborHeapEntries(last, child) <= 0)
                break;
            this.entries[index] = child;
            index = childIndex;
        }
        this.entries[index] = last;
        return first;
    }
}

/**
 * Prunes a date-ordered series by removing images closest to either adjacent
 * timestamp neighbor. A heap keeps each removal and local neighbor update O(log n).
 */
export function selectByTimeNeighbors(
    candidates: readonly TimeNeighborCandidate[],
    count: number,
): string[] {
    if (candidates.length <= count)
        return candidates.map((candidate) => candidate.id);

    const nodes: TimeNeighborNode[] = candidates.map((candidate, index) => ({
        ...candidate,
        previous: index === 0 ? undefined : index - 1,
        next: index === candidates.length - 1 ? undefined : index + 1,
        active: true,
        version: 0,
    }));
    const heap = new TimeNeighborMinHeap();

    const updateNode = (index: number | undefined): void => {
        if (index === undefined)
            return;
        const node = nodes[index];
        if (!node.active)
            return;

        node.version++;
        const leftDistance = node.previous === undefined
            ? Number.POSITIVE_INFINITY
            : 1 - cosineSimilarity(node.embedding, nodes[node.previous].embedding);
        const rightDistance = node.next === undefined
            ? Number.POSITIVE_INFINITY
            : 1 - cosineSimilarity(node.embedding, nodes[node.next].embedding);
        heap.push({
            index,
            score: Math.min(leftDistance, rightDistance),
            version: node.version,
        });
    };

    for (let index = 0; index < nodes.length; index++)
        updateNode(index);

    let remainingCount = nodes.length;
    while (remainingCount > count) {
        const entry = heap.pop();
        if (!entry)
            break;
        const node = nodes[entry.index];
        if (!node.active || node.version !== entry.version)
            continue;

        node.active = false;
        remainingCount--;

        const { previous, next } = node;
        if (previous !== undefined)
            nodes[previous].next = next;
        if (next !== undefined)
            nodes[next].previous = previous;

        updateNode(previous);
        updateNode(next);
    }

    return nodes
        .filter((node) => node.active)
        .map((node) => node.id);
}

export function computeIntrinsicUniqueness(
    embeddings: ReadonlyMap<string, Float32Array>,
): Map<string, number> {
    const ids = [...embeddings.keys()];
    const scores = new Map<string, number>();

    for (const id of ids) {
        const embedding = embeddings.get(id);
        if (!embedding)
            continue;

        let nearestSimilarity = -1;
        for (const otherId of ids) {
            if (otherId === id)
                continue;
            const otherEmbedding = embeddings.get(otherId);
            if (!otherEmbedding)
                continue;
            const similarity = cosineSimilarity(embedding, otherEmbedding);
            if (similarity > nearestSimilarity)
                nearestSimilarity = similarity;
        }

        scores.set(id, nearestSimilarity < 0 ? 1 : 1 - nearestSimilarity);
    }

    return scores;
}

function normalizeScores(scores: Map<string, number>): Map<string, number> {
    if (!scores.size)
        return scores;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const score of scores.values()) {
        min = Math.min(min, score);
        max = Math.max(max, score);
    }

    if (min === max)
        return new Map([...scores.entries()].map(([id]) => [id, 1]));

    const range = max - min;
    return new Map(
        [...scores.entries()].map(([id, score]) => [id, (score - min) / range]),
    );
}

function compareCandidateSelection(
    left: { id: string; score: number; sourcePosition: number },
    right: { id: string; score: number; sourcePosition: number },
): number {
    if (right.score !== left.score)
        return right.score - left.score;
    if (left.sourcePosition !== right.sourcePosition)
        return left.sourcePosition - right.sourcePosition;
    return left.id.localeCompare(right.id);
}

export type MmrRankResult = {
    orderedIds: string[];
    uniquenessScores: Map<string, number>;
};

export function rankMmrFromEmbeddings(
    candidateIds: string[],
    embeddings: ReadonlyMap<string, Float32Array>,
    directive: ParsedMmrDirective,
    settings: MmrSettings,
): MmrRankResult {
    const rows = candidateIds
        .map((id) => {
            const embedding = embeddings.get(id);
            return embedding ? { id, embedding } : undefined;
        })
        .filter((row): row is { id: string; embedding: Float32Array } => !!row);

    if (!rows.length) {
        return {
            orderedIds: [],
            uniquenessScores: new Map(),
        };
    }

    const embeddingMap = new Map(rows.map((row) => [row.id, row.embedding]));
    const intrinsicScores = computeIntrinsicUniqueness(embeddingMap);
    const normalizedRelevance = normalizeScores(intrinsicScores);
    const sourcePositions = new Map(candidateIds.map((id, index) => [id, index]));
    const lambda = settings.diversityWeight;
    const selected: { id: string; embedding: Float32Array; intrinsicUniqueness: number; sourcePosition: number }[] = [];
    const remaining = rows.map((row) => ({
        id: row.id,
        embedding: row.embedding,
        intrinsicUniqueness: intrinsicScores.get(row.id) ?? 0,
        sourcePosition: sourcePositions.get(row.id) ?? Number.MAX_SAFE_INTEGER,
    }));
    const maxSimilarityToSelected = new Map<string, number>();

    while (selected.length < directive.resultCount && remaining.length) {
        let best: (typeof remaining)[number] & { mmrScore: number } | undefined;

        for (const candidate of remaining) {
            const redundancy = maxSimilarityToSelected.get(candidate.id) ?? 0;
            const relevance = normalizedRelevance.get(candidate.id) ?? 0;
            const mmrScore = lambda * relevance - (1 - lambda) * redundancy;
            if (!best || compareCandidateSelection(
                { id: candidate.id, score: mmrScore, sourcePosition: candidate.sourcePosition },
                { id: best.id, score: best.mmrScore, sourcePosition: best.sourcePosition },
            ) < 0) {
                best = { ...candidate, mmrScore };
            }
        }

        if (!best)
            break;

        selected.push(best);
        const selectedIndex = remaining.findIndex((candidate) => candidate.id === best!.id);
        remaining.splice(selectedIndex, 1);

        for (const candidate of remaining) {
            const similarity = cosineSimilarity(best.embedding, candidate.embedding);
            const current = maxSimilarityToSelected.get(candidate.id) ?? 0;
            if (similarity > current)
                maxSimilarityToSelected.set(candidate.id, similarity);
        }
    }

    return {
        orderedIds: selected.map((candidate) => candidate.id),
        uniquenessScores: new Map(
            selected.map((candidate) => [candidate.id, candidate.intrinsicUniqueness]),
        ),
    };
}
