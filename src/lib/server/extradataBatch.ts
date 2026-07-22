import { calcTimeRemaining, updateLine } from '$lib/tools/misc';
import { MetaDB } from './db';
import { extradataWorkerPool } from './workers/extradataWorkerPool';
import type { ImageExtraData } from '$lib/types/images';

/** Progress reporting / staging write grain (not the worker job size). */
const BATCH_SIZE = 1000;

export async function computeExtradataForIds(
    ids: string[],
    onProgress?: (done: number, total: number) => void,
): Promise<ImageExtraData[]> {
    const results: ImageExtraData[] = new Array(ids.length);
    const total = ids.length;
    if (!total)
        return [];

    // Map id → index so out-of-order worker slices can be reassembled.
    const indexById = new Map(ids.map((id, i) => [id, i]));

    await extradataWorkerPool.processAll(
        total,
        (start, count) => MetaDB.getMany(ids.slice(start, start + count)),
        (batch, done) => {
            for (const item of batch) {
                const index = indexById.get(item.id);
                if (index !== undefined)
                    results[index] = item;
            }
            onProgress?.(done, total);
        },
    );

    return results.filter(Boolean);
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
    let writeBuffer: ImageExtraData[] = [];
    let flushing = Promise.resolve();
    let reportedDone = 0;

    const flushWriteBuffer = () => {
        flushing = flushing.then(async () => {
            if (!writeBuffer.length)
                return;
            const batch = writeBuffer;
            writeBuffer = [];
            reportedDone += batch.length;
            await onBatch(batch, reportedDone, total);
            remaining = calcTimeRemaining(start, reportedDone, total);
            updateLine(`${label}: ${reportedDone} / ${total} | estimate: ${remaining}`);
            onProgress?.(reportedDone, total);
        });
        return flushing;
    };

    updateLine(`${label}: 0 / ${total} | estimate: ${remaining}`);

    await extradataWorkerPool.processAll(
        total,
        (startIndex, count) => MetaDB.getMany(ids.slice(startIndex, startIndex + count)),
        async (batch) => {
            writeBuffer.push(...batch);
            if (writeBuffer.length >= BATCH_SIZE)
                await flushWriteBuffer();
        },
    );

    await flushWriteBuffer();
    updateLine('');
}

export { BATCH_SIZE as EXTRADATA_BATCH_SIZE };
