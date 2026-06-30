import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'worker_threads';
import { computeExtradataBatch } from '../extradataComputeCore';
import type { ImageExtraData, ServerImageFull } from '$lib/types/images';
import { fileExistsSync } from '../filetools';

const POOL_SIZE = Math.max(1, Math.min(4, os.cpus().length - 1));
const BATCH_SLICE = Math.ceil(1000 / POOL_SIZE);

type WorkerJob = {
    fulls: ServerImageFull[];
    resolve: (results: ImageExtraData[]) => void;
    reject: (error: unknown) => void;
};

function computeOnMainThread(fulls: ServerImageFull[]): ImageExtraData[] {
    return computeExtradataBatch(fulls);
}

function resolveWorkerPath(): string | undefined {
    const fromModule = fileURLToPath(new URL('./extradataCompute.worker.js', import.meta.url));
    if (fileExistsSync(fromModule))
        return fromModule;

    const fromBuild = path.join(process.cwd(), 'build/workers/extradataCompute.js');
    if (fileExistsSync(fromBuild))
        return fromBuild;

    const fromSource = fileURLToPath(new URL('./extradataCompute.worker.ts', import.meta.url));
    if (fileExistsSync(fromSource))
        return fromSource;

    return undefined;
}

class ExtradataWorkerPool {
    private workers: Worker[] = [];
    private idleWorkers: Worker[] = [];
    private queue: WorkerJob[] = [];
    private useWorkers = false;
    private initialized = false;

    private init() {
        if (this.initialized)
            return;
        this.initialized = true;

        const workerPath = resolveWorkerPath();
        if (!workerPath)
            return;

        try {
            for (let i = 0; i < POOL_SIZE; i++) {
                const worker = new Worker(workerPath, {
                    execArgv: workerPath.endsWith('.ts') ? ['--experimental-strip-types'] : undefined,
                });
                worker.on('message', (results: ImageExtraData[]) => {
                    const job = (worker as Worker & { currentJob?: WorkerJob }).currentJob;
                    if (job) {
                        job.resolve(results);
                        (worker as Worker & { currentJob?: WorkerJob }).currentJob = undefined;
                    }
                    this.idleWorkers.push(worker);
                    this.dispatch();
                });
                worker.on('error', (error) => {
                    const job = (worker as Worker & { currentJob?: WorkerJob }).currentJob;
                    if (job) {
                        job.reject(error);
                        (worker as Worker & { currentJob?: WorkerJob }).currentJob = undefined;
                    }
                    this.idleWorkers.push(worker);
                    this.dispatch();
                });
                this.workers.push(worker);
                this.idleWorkers.push(worker);
            }
            this.useWorkers = true;
        } catch (error) {
            console.warn('Failed to spawn extradata worker pool, using main thread:', error);
            this.terminate();
        }
    }

    private dispatch() {
        while (this.idleWorkers.length && this.queue.length) {
            const worker = this.idleWorkers.pop()!;
            const job = this.queue.shift()!;
            (worker as Worker & { currentJob?: WorkerJob }).currentJob = job;
            worker.postMessage(job.fulls);
        }
    }

    private runWorkerBatch(fulls: ServerImageFull[]): Promise<ImageExtraData[]> {
        return new Promise((resolve, reject) => {
            this.queue.push({ fulls, resolve, reject });
            this.dispatch();
        });
    }

    async computeBatch(fulls: ServerImageFull[]): Promise<ImageExtraData[]> {
        this.init();
        if (!fulls.length)
            return [];
        if (!this.useWorkers)
            return computeOnMainThread(fulls);

        const chunks: ServerImageFull[][] = [];
        for (let i = 0; i < fulls.length; i += BATCH_SLICE)
            chunks.push(fulls.slice(i, i + BATCH_SLICE));

        const results = await Promise.all(chunks.map(chunk => this.runWorkerBatch(chunk)));
        return results.flat();
    }

    terminate() {
        for (const worker of this.workers)
            worker.terminate();
        this.workers = [];
        this.idleWorkers = [];
        this.queue = [];
        this.useWorkers = false;
    }
}

export const extradataWorkerPool = new ExtradataWorkerPool();
