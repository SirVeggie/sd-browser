import { parentPort } from 'worker_threads';
import { InferenceSession } from 'onnxruntime-node';
import { inferNsfwClassifyScores } from '../nsfwClassifyInfer';

type ClassifyJob = {
    imagePath: string;
    modelPath: string;
};

type WorkerReply =
    | { ok: true; scores: number[] }
    | { ok: false; error: string };

let session: InferenceSession | undefined;
let loadedModelPath: string | undefined;

async function getSession(modelPath: string): Promise<InferenceSession> {
    if (session && loadedModelPath === modelPath)
        return session;
    session?.release();
    session = await InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        intraOpNumThreads: 2,
        interOpNumThreads: 1,
    });
    loadedModelPath = modelPath;
    return session;
}

parentPort?.on('message', async (job: ClassifyJob) => {
    try {
        const loaded = await getSession(job.modelPath);
        const scores = await inferNsfwClassifyScores(loaded, job.imagePath);
        const reply: WorkerReply = { ok: true, scores };
        parentPort?.postMessage(reply);
    } catch (error) {
        const reply: WorkerReply = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
        parentPort?.postMessage(reply);
    }
});
