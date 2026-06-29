import { MetaDB } from '../db';
import { readMediaDimensions } from '../imageDimensions';
import { calcProgress, calcTimeRemaining, calcTimeSpent, limitedParallelMap, updateLine } from '$lib/tools/misc';

type DimensionUpdate = {
    id: string;
    width: number;
    height: number;
};

/** v2 → v3: store image dimensions and backfill existing rows. */
export async function migrateV3() {
    MetaDB.ensureColumnShort('width', 'INTEGER');
    MetaDB.ensureColumnShort('height', 'INTEGER');
    await backfillImageDimensions();
}

/** Backfill width/height for indexed rows that are still missing them. */
export async function backfillImageDimensions() {
    const total = MetaDB.countMissingDimensions();
    if (!total) {
        return;
    }

    const log = `Backfilling dimensions for ${total} images`;
    updateLine(`${log}...`);

    const batchSize = 500;
    const parallelReads = 5;
    const tStart = Date.now();
    let processed = 0;
    let updated = 0;

    while (true) {
        const batch = MetaDB.getShortBatchMissingDimensions(batchSize);
        if (!batch.length) {
            break;
        }

        const results = await limitedParallelMap(batch, async (image) => {
            const dims = await readMediaDimensions(image.file);
            if (dims) {
                return { id: image.id, width: dims.width, height: dims.height } satisfies DimensionUpdate;
            }
            return { id: image.id, width: 0, height: 0 } satisfies DimensionUpdate;
        }, parallelReads);

        const updates = results.filter((item): item is DimensionUpdate => !!item);
        processed += batch.length;
        MetaDB.updateDimensions(updates);
        updated += updates.filter((item) => item.width > 0 && item.height > 0).length;

        updateLine(`${log}: ${calcProgress(processed, total)}% | estimate: ${calcTimeRemaining(tStart, processed, total)}`);
    }

    const failed = processed - updated;
    updateLine(`${log}: ${updated} updated, ${failed} unreadable in ${calcTimeSpent(tStart)}\n`);
}
