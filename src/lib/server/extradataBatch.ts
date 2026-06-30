import { calcTimeRemaining, updateLine } from '$lib/tools/misc';
import { MetaDB } from './db';
import { extradataWorkerPool } from './workers/extradataWorkerPool';
import type { ImageExtraData } from '$lib/types/images';

const BATCH_SIZE = 1000;

export async function computeExtradataForIds(
    ids: string[],
    onProgress?: (done: number, total: number) => void,
): Promise<ImageExtraData[]> {
    const results: ImageExtraData[] = [];
    const total = ids.length;
    let done = 0;

    while (done < total) {
        const batchIds = ids.slice(done, done + BATCH_SIZE);
        const fulls = MetaDB.getMany(batchIds);
        const batch = await extradataWorkerPool.computeBatch(fulls);
        results.push(...batch);
        done += batchIds.length;
        onProgress?.(done, total);
    }

    return results;
}

export async function forEachExtradataBatch(
    ids: string[],
    options: {
        label: string;
        onBatch: (batch: ImageExtraData[], done: number, total: number) => void | Promise<void>;
        onProgress?: (done: number, total: number) => void;
    },
): Promise<void> {
    const { label, onBatch, onProgress } = options;
    const total = ids.length;
    if (!total)
        return;

    const start = Date.now();
    let remaining = '?';
    let done = 0;

    while (done < total) {
        const batchIds = ids.slice(done, done + BATCH_SIZE);
        updateLine(`${label}: ${done} / ${total} (processing) | estimate: ${remaining}`);
        const batch = await computeExtradataForIds(batchIds);
        done += batchIds.length;
        await onBatch(batch, done, total);
        remaining = calcTimeRemaining(start, done, total);
        updateLine(`${label}: ${done} / ${total} (loading)    | estimate: ${remaining}`);
        onProgress?.(done, total);
    }

    updateLine('');
}

export { BATCH_SIZE as EXTRADATA_BATCH_SIZE };
