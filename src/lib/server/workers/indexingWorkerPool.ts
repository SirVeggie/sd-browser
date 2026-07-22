import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'worker_threads';
import { processIndexingJobs, type IndexingJob, type IndexingResult } from '../indexingComputeCore';
import { fileExistsSync } from '../filetools';

const POOL_SIZE = Math.max(1, Math.min(os.cpus().length - 1, 8));
/** Jobs per worker message — balances IPC overhead vs parallelism. */
const JOB_SLICE = 8;

type WorkerJob = {
    jobs: IndexingJob[];
    resolve: (results: IndexingResult[]) => void;
    reject: (error: unknown) => void;
};

type WorkerReply =
    | { ok: true; results: IndexingResult[] }
    | { ok: false; error: string };

function resolveWorkerPath(): string | undefined {
    const fromModule = fileURLToPath(new URL('./indexing.worker.js', import.meta.url));
    if (fileExistsSync(fromModule))
        return fromModule;

    const fromBuild = path.join(process.cwd(), 'build/workers/indexing.js');
    if (fileExistsSync(fromBuild))
        return fromBuild;

    const fromSource = fileURLToPath(new URL('./indexing.worker.ts', import.meta.url));
    if (fileExistsSync(fromSource))
        return fromSource;

    return undefined;
}

class IndexingWorkerPool {
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
                worker.on('message', (reply: WorkerReply) => {
                    const job = (worker as Worker & { currentJob?: WorkerJob }).currentJob;
                    if (job) {
                        if (reply.ok)
                            job.resolve(reply.results);
                        else
                            job.reject(new Error(reply.error));
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
            console.log(`Indexing worker pool ready (${POOL_SIZE} threads)`);
        } catch (error) {
            console.warn('Failed to spawn indexing worker pool, using main thread:', error);
            this.terminate();
        }
    }

    private dispatch() {
        while (this.idleWorkers.length && this.queue.length) {
            const worker = this.idleWorkers.pop()!;
            const job = this.queue.shift()!;
            (worker as Worker & { currentJob?: WorkerJob }).currentJob = job;
            worker.postMessage(job.jobs);
        }
    }

    private runWorkerSlice(jobs: IndexingJob[]): Promise<IndexingResult[]> {
        return new Promise((resolve, reject) => {
            this.queue.push({ jobs, resolve, reject });
            this.dispatch();
        });
    }

    /**
     * Process jobs with backpressure. `onResults` is called as each slice finishes
     * (not necessarily in input order).
     */
    async processAll(
        jobs: IndexingJob[],
        onResults: (results: IndexingResult[]) => void | Promise<void>,
        options?: { maxInFlight?: number },
    ): Promise<void> {
        this.init();
        if (!jobs.length)
            return;

        if (!this.useWorkers) {
            // Main-thread fallback: process in slices to keep the event loop responsive.
            for (let i = 0; i < jobs.length; i += JOB_SLICE) {
                const slice = jobs.slice(i, i + JOB_SLICE);
                const results = await processIndexingJobs(slice);
                await onResults(results);
            }
            return;
        }

        const maxInFlight = options?.maxInFlight ?? POOL_SIZE * 3;
        let nextIndex = 0;
        let inFlight = 0;
        let failed: unknown;

        await new Promise<void>((resolve, reject) => {
            const pump = () => {
                if (failed) {
                    reject(failed);
                    return;
                }
                if (nextIndex >= jobs.length && inFlight === 0) {
                    resolve();
                    return;
                }
                while (inFlight < maxInFlight && nextIndex < jobs.length) {
                    const slice = jobs.slice(nextIndex, nextIndex + JOB_SLICE);
                    nextIndex += slice.length;
                    inFlight++;
                    this.runWorkerSlice(slice)
                        .then(async (results) => {
                            try {
                                await onResults(results);
                            } catch (error) {
                                failed = error;
                            }
                        })
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

    get poolSize(): number {
        this.init();
        return this.useWorkers ? POOL_SIZE : 1;
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

export const indexingWorkerPool = new IndexingWorkerPool();
