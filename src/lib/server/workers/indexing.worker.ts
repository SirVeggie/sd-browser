import { parentPort } from 'worker_threads';
import { processIndexingJobs, type IndexingJob } from '../indexingComputeCore';

parentPort?.on('message', async (jobs: IndexingJob[]) => {
    try {
        const results = await processIndexingJobs(jobs);
        parentPort?.postMessage({ ok: true, results });
    } catch (error) {
        parentPort?.postMessage({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});
