import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'worker_threads';
import { computeExtradataBatch } from '../extradataComputeCore';
import type { ImageExtraData, ServerImageFull } from '$lib/types/images';
import { fileExistsSync } from '../filetools';

/** Match indexing pool sizing — saturate CPU for parse-heavy recalc. */
const POOL_SIZE = Math.max(1, Math.min(os.cpus().length - 1, 8));
/** Images per worker message. */
const JOB_SLICE = 64;

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
        if (!workerPath) {
            console.warn('Extradata worker bundle not found, using main thread');
            return;
        }

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
            console.log(`Extradata worker pool ready (${POOL_SIZE} threads)`);
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

    private runWorkerSlice(fulls: ServerImageFull[]): Promise<ImageExtraData[]> {
        return new Promise((resolve, reject) => {
            this.queue.push({ fulls, resolve, reject });
            this.dispatch();
        });
    }

    get poolSize(): number {
        this.init();
        return this.useWorkers ? POOL_SIZE : 1;
    }

    get jobSlice(): number {
        return JOB_SLICE;
    }

    /**
     * Compute extradata for a list of full images, splitting across the pool.
     */
    async computeBatch(fulls: ServerImageFull[]): Promise<ImageExtraData[]> {
        this.init();
        if (!fulls.length)
            return [];
        if (!this.useWorkers)
            return computeOnMainThread(fulls);

        const chunks: ServerImageFull[][] = [];
        for (let i = 0; i < fulls.length; i += JOB_SLICE)
            chunks.push(fulls.slice(i, i + JOB_SLICE));

        const results = await Promise.all(chunks.map(chunk => this.runWorkerSlice(chunk)));
        return results.flat();
    }

    /**
     * Keep the pool saturated: `loadSlice` runs on the main thread (DB read),
     * compute runs on workers, `onResults` runs on the main thread (DB write).
     */
    async processAll(
        total: number,
        loadSlice: (start: number, count: number) => ServerImageFull[],
        onResults: (results: ImageExtraData[], done: number, total: number) => void | Promise<void>,
        options?: { maxInFlight?: number },
    ): Promise<void> {
        this.init();
        if (total <= 0)
            return;

        const slice = JOB_SLICE;
        const maxInFlight = options?.maxInFlight ?? (this.useWorkers ? POOL_SIZE * 2 : 1);
        let nextIndex = 0;
        let completed = 0;
        let inFlight = 0;
        let failed: unknown;

        const runSlice = async (start: number, count: number) => {
            const fulls = loadSlice(start, count);
            if (!fulls.length) {
                completed += count;
                return;
            }
            const results = this.useWorkers
                ? await this.runWorkerSlice(fulls)
                : computeOnMainThread(fulls);
            completed += fulls.length;
            await onResults(results, completed, total);
        };

        await new Promise<void>((resolve, reject) => {
            const pump = () => {
                if (failed) {
                    reject(failed);
                    return;
                }
                if (nextIndex >= total && inFlight === 0) {
                    resolve();
                    return;
                }
                while (inFlight < maxInFlight && nextIndex < total) {
                    const start = nextIndex;
                    const count = Math.min(slice, total - nextIndex);
                    nextIndex += count;
                    inFlight++;
                    runSlice(start, count)
                        .catch((error) => {
                            failed = error;
                        })
                        .finally(() => {
                            inFlight--;
                            pump();
                        });
                }
            };
            pump();
        });
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
