import { parentPort } from 'worker_threads';
import { computeExtradataBatch } from '../extradataComputeCore';
import type { ServerImagePartial } from '../../types/images';

parentPort?.on('message', (fulls: ServerImagePartial[]) => {
    parentPort?.postMessage(computeExtradataBatch(fulls));
});
