import { parentPort } from 'worker_threads';
import { computeExtradataBatch } from '../extradataComputeCore';
import type { ServerImageFull } from '../../types/images';

parentPort?.on('message', (fulls: ServerImageFull[]) => {
    parentPort?.postMessage(computeExtradataBatch(fulls));
});
