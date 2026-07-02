import { MetaCalcDB, MetaDB, MiscDB } from './db';
import { forEachExtradataBatch } from './extradataBatch';
import { backgroundTasks } from './background';
import {
    completeOperation,
    failOperation,
    startOperation,
    updateProgress,
} from './operations';
import { getImageList, refreshExtradataInMemory } from './dataIndex';
import { invalidateExplorationPools } from './exploration';

const explorationCacheKeys = [
    'exploration-cache:sparse',
    'exploration-cache:similar',
    'exploration-cache:unique',
];

function invalidatePersistedExplorationCaches() {
    for (const key of explorationCacheKeys)
        MiscDB.delete(key);
    invalidateExplorationPools('extradata recalculation completed');
}

async function runExtradataRecalc(operationId: string) {
    try {
        MetaCalcDB.cleanupOrphanExtradataTables();
        MetaCalcDB.clearStaging();

        const ids = MetaDB.getAllShort().map(image => image.id);
        const total = ids.length;
        updateProgress(operationId, 0, 'Recalculating extra data');

        await forEachExtradataBatch(ids, {
            label: 'Recalculating extra data',
            onBatch: async (batch, done) => {
                MetaCalcDB.setAllStaging(batch);
                updateProgress(operationId, done);
            },
        });

        const validIds = new Set(getImageList().keys());
        MetaCalcDB.swapStagingToLive(validIds);
        refreshExtradataInMemory();
        invalidatePersistedExplorationCaches();
        completeOperation(operationId);
        console.log(`Extradata recalculation complete (${total} images)`);
    } catch (error) {
        MetaCalcDB.dropStaging();
        const message = error instanceof Error ? error.message : 'Extradata recalculation failed';
        failOperation(operationId, message);
        console.error(message);
    }
}

export function startExtradataRecalc(): { operationId: string } {
    const total = MetaDB.count();
    const operation = startOperation('extradata-recalc', 'Recalculating extra data', total);

    backgroundTasks.addWork(async () => {
        await runExtradataRecalc(operation.id);
    });

    return { operationId: operation.id };
}

export { computeExtradataForIds, forEachExtradataBatch } from './extradataBatch';
