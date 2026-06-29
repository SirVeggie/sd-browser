import { invalidAuth } from '$lib/server/auth';
import { recalculateSimilarCache } from '$lib/server/exploration';
import { getImageList } from '$lib/server/filemanager';
import { error, success } from '$lib/server/responses';
import { isRecalculateSimilarCacheRequest } from '$lib/types/requests';

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query = await e.request.json();
    if (!isRecalculateSimilarCacheRequest(query))
        return error('Invalid request body', 400);

    const images = [...getImageList().values()];
    const pool = recalculateSimilarCache(
        images,
        query.similarityAlgorithm,
        query.similarityThreshold,
    );

    return success({
        poolSize: pool.size,
        imageCount: images.length,
    });
}
