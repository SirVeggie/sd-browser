import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'worker_threads';
import { InferenceSession } from 'onnxruntime-node';
import { fileExistsSync } from '../filetools';
import { inferNsfwClassifyScores } from '../nsfwClassifyInfer';

const POOL_SIZE = Math.max(1, Math.min(os.cpus().length - 1, 2));

type ClassifyJob = {
    imagePath: string;
    modelPath: string;
    resolve: (scores: number[]) => void;
    reject: (error: unknown) => void;
};

type WorkerReply =
    | { ok: true; scores: number[] }
    | { ok: false; error: string };

function resolveWorkerPath(): string | undefined {
    const fromModule = fileURLToPath(new URL('./nsfwClassify.worker.js', import.meta.url));
    if (fileExistsSync(fromModule))
        return fromModule;

    const fromBuild = path.join(process.cwd(), 'build/workers/nsfwClassify.js');
    if (fileExistsSync(fromBuild))
        return fromBuild;

    const fromSource = fileURLToPath(new URL('./nsfwClassify.worker.ts', import.meta.url));
    if (fileExistsSync(fromSource))
        return fromSource;

    return undefined;
}

class NsfwClassifyWorkerPool {
    private workers: Worker[] = [];
    private idleWorkers: Worker[] = [];
    private queue: ClassifyJob[] = [];
    private useWorkers = false;
    private initialized = false;
    private mainSession: InferenceSession | undefined;
    private mainModelPath: string | undefined;

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
                    const job = (worker as Worker & { currentJob?: ClassifyJob }).currentJob;
                    if (job) {
                        if (reply.ok)
                            job.resolve(reply.scores);
                        else
                            job.reject(new Error(reply.error));
                        (worker as Worker & { currentJob?: ClassifyJob }).currentJob = undefined;
                    }
                    this.idleWorkers.push(worker);
                    this.dispatch();
                });
                worker.on('error', (error) => {
                    const job = (worker as Worker & { currentJob?: ClassifyJob }).currentJob;
                    if (job) {
                        job.reject(error);
                        (worker as Worker & { currentJob?: ClassifyJob }).currentJob = undefined;
                    }
                    this.idleWorkers.push(worker);
                    this.dispatch();
                });
                this.workers.push(worker);
                this.idleWorkers.push(worker);
            }
            this.useWorkers = true;
            console.log(`NSFW classify worker pool ready (${POOL_SIZE} threads)`);
        } catch (error) {
            console.warn('Failed to spawn NSFW classify workers, using main thread:', error);
            this.terminate();
        }
    }

    private dispatch() {
        while (this.idleWorkers.length && this.queue.length) {
            const worker = this.idleWorkers.pop()!;
            const job = this.queue.shift()!;
            (worker as Worker & { currentJob?: ClassifyJob }).currentJob = job;
            worker.postMessage({ imagePath: job.imagePath, modelPath: job.modelPath });
        }
    }

    async classify(imagePath: string, modelPath: string): Promise<number[]> {
        this.init();
        if (!this.useWorkers)
            return this.classifyOnMain(imagePath, modelPath);

        return new Promise((resolve, reject) => {
            this.queue.push({ imagePath, modelPath, resolve, reject });
            this.dispatch();
        });
    }

    private async classifyOnMain(imagePath: string, modelPath: string): Promise<number[]> {
        if (!this.mainSession || this.mainModelPath !== modelPath) {
            await this.mainSession?.release();
            this.mainSession = await InferenceSession.create(modelPath, {
                executionProviders: ['cpu'],
                intraOpNumThreads: 2,
                interOpNumThreads: 1,
            });
            this.mainModelPath = modelPath;
        }
        return inferNsfwClassifyScores(this.mainSession, imagePath);
    }

    terminate() {
        for (const worker of this.workers)
            worker.terminate();
        this.workers = [];
        this.idleWorkers = [];
        this.queue = [];
        this.useWorkers = false;
        void this.mainSession?.release();
        this.mainSession = undefined;
        this.mainModelPath = undefined;
    }
}

export const nsfwClassifyWorkerPool = new NsfwClassifyWorkerPool();
