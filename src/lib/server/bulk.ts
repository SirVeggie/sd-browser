import { canVectorizeImage, limitedParallelMap, updateLine } from "$lib/tools/misc";
import type { BulkRequest } from "$lib/types/requests";
import { isEmbeddingConfigured } from "$lib/types/embeddings";
import { notifyMetadataChange } from "./imageChangeHub";
import { vectorizeImageBatch, fetchMediaMarkerForConfig } from "./embeddings";
import { EmbeddingDB } from "./embeddingDb";
import { annotateImage, clearAnnotation, modifyAnnotation } from "./llm";
import { bulkUpdateImageTags } from "./tags";
import { copyImages, deleteImages, moveImages } from "./filemanager";
import { explorationFromRequest, searchImagesAsync } from "./searching";
import { getSession, validateSession } from "./searchSessions";
import { getImage } from "./dataIndex";

const CHUNK_SIZE = 100;
const BULK_FAILURE_ABORT_RATIO = 0.5;
const BULK_FAILURE_ABORT_MIN_PROCESSED = 5;

type BulkProgressStats = {
    totalTaskDurationMs: number;
    failures: number;
    lastError?: string;
};

type BulkFailureTracker = {
    failures: number;
    errors: string[];
    lastError?: string;
};

function shouldAbortBulkRun(failures: number, processed: number, total: number): boolean {
    if (processed <= 0) return false;
    const minProcessed = Math.min(total, BULK_FAILURE_ABORT_MIN_PROCESSED);
    return processed >= minProcessed && failures > processed * BULK_FAILURE_ABORT_RATIO;
}

function throwBulkAborted(tracker: BulkFailureTracker, processed: number): never {
    throw new Error(
        `Stopped after ${tracker.failures}/${processed} errors (>50% failure rate): ${tracker.lastError ?? "Unknown error"}`,
    );
}

function bulkProgressStats(
    tracker: BulkFailureTracker,
    totalTaskDurationMs: number,
): BulkProgressStats {
    return {
        totalTaskDurationMs,
        failures: tracker.failures,
        lastError: tracker.lastError,
    };
}

async function resolveBulkImageIds(request: BulkRequest): Promise<string[]> {
    if (request.sessionId && validateSession(request.sessionId, request)) {
        const session = getSession(request.sessionId);
        if (session?.complete && session.orderedIds.length) {
            return [...session.orderedIds];
        }
    }

    const images = await searchImagesAsync(
        request.search,
        request.matching,
        explorationFromRequest(request),
        { sorting: request.sorting },
    );
    return images.images.map((image) => image.id);
}

function filterVectorizeWorkIds(ids: string[], force: boolean): string[] {
    return ids.filter((id) => {
        const image = getImage(id);
        if (!image || !canVectorizeImage(image)) return false;
        return force || !EmbeddingDB.hasImageEmbedding(id);
    });
}

function countVectorizeSkips(ids: string[], force: boolean): {
    alreadyEmbedded: number;
    noPreview: number;
} {
    let alreadyEmbedded = 0;
    let noPreview = 0;
    for (const id of ids) {
        const image = getImage(id);
        if (!image) continue;
        if (!canVectorizeImage(image)) {
            noPreview++;
            continue;
        }
        if (!force && EmbeddingDB.hasImageEmbedding(id)) {
            alreadyEmbedded++;
        }
    }
    return { alreadyEmbedded, noPreview };
}

export async function runBulkAction(
    request: BulkRequest,
    onProgress: (done: number, total: number, stats?: BulkProgressStats) => void,
    signal?: AbortSignal,
): Promise<boolean> {
    const changedIds = new Set<string>();
    const markChanged = (id: string) => {
        changedIds.add(id);
    };
    const isCancelled = () => signal?.aborted ?? false;
    let broadcastMetadataChange = true;

    function completeBulk(result: boolean): boolean {
        if (!isCancelled()) {
            broadcastMetadataChange = false;
        }
        return result;
    }

    try {
    const ids = await resolveBulkImageIds(request);
    const total = ids.length;
    let done = 0;

    onProgress(done, total);
    const searchLabel = request.search ? `"${request.search}"` : "(no search term)";
    console.log(`Bulk ${request.action.type}: processing ${total} images, search=${searchLabel}`);

    if (request.action.type === "delete") {
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            if (isCancelled()) break;
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            await deleteImages(chunk);
            done += chunk.length;
            onProgress(done, total);
            updateLine(`Bulk delete: ${done}/${total}`);
        }
        updateLine("");
        return completeBulk(true);
    }

    if (request.action.type === "move") {
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            if (isCancelled()) break;
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            await moveImages(chunk, request.action.folder);
            done += chunk.length;
            onProgress(done, total);
            updateLine(`Bulk move: ${done}/${total}`);
        }
        updateLine("");
        return completeBulk(false);
    }

    if (request.action.type === "copy") {
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            if (isCancelled()) break;
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            await copyImages(chunk, request.action.folder);
            done += chunk.length;
            onProgress(done, total);
            updateLine(`Bulk copy: ${done}/${total}`);
        }
        updateLine("");
        return completeBulk(false);
    }

    if (request.action.type === "annotate") {
        const annotateOptions = request.action;
        const tracker: BulkFailureTracker = { failures: 0, errors: [] };
        let completed = 0;
        let totalTaskDurationMs = 0;

        let aborted = false;
        const shouldContinue = () => !aborted && !isCancelled();

        function recordAnnotateFailure(id: string, message: string, label: string) {
            tracker.lastError = message;
            tracker.failures++;
            tracker.errors.push(`${id}: ${message}`);
            console.error(`Bulk ${label} failed: ${message}`);
        }

        function afterAnnotateItem(label: string) {
            onProgress(completed, total, bulkProgressStats(tracker, totalTaskDurationMs));
            console.log(`Bulk ${label}: completed ${completed}/${total}`);
            updateLine(`Bulk ${label}: completed ${completed}/${total}`);
            if (shouldAbortBulkRun(tracker.failures, completed, total)) {
                aborted = true;
                updateLine("");
                throwBulkAborted(tracker, completed);
            }
        }

        const parallel = Math.max(1, request.llm?.parallelCalls || 8);

        if (annotateOptions.mode === "clear") {
            console.log(`Bulk clear annotation: ${parallel} parallel workers`);
            await limitedParallelMap(ids, async (id) => {
                if (aborted) return;
                const taskStart = Date.now();
                try {
                    clearAnnotation(id);
                    markChanged(id);
                } catch (cause) {
                    const message = cause instanceof Error ? cause.message : String(cause);
                    recordAnnotateFailure(id, message, "clear annotation");
                }
                totalTaskDurationMs += Date.now() - taskStart;
                completed++;
                afterAnnotateItem("clear annotation");
            }, parallel, shouldContinue);

            updateLine("");
            if (isCancelled()) return false;
            if (tracker.failures) {
                throw new Error(
                    `Bulk clear annotation finished with ${tracker.failures}/${total} failures:\n${tracker.errors.slice(0, 5).join("\n")}`,
                );
            }
            return completeBulk(false);
        }

        if (annotateOptions.mode === "modify") {
            console.log(`Bulk modify annotation: ${parallel} parallel workers`);
            await limitedParallelMap(ids, async (id) => {
                if (aborted) return;
                const taskStart = Date.now();
                try {
                    const saved = modifyAnnotation(id, annotateOptions);
                    if (saved) {
                        markChanged(id);
                    } else {
                        recordAnnotateFailure(id, "empty result", "modify annotation");
                    }
                } catch (cause) {
                    const message = cause instanceof Error ? cause.message : String(cause);
                    recordAnnotateFailure(id, message, "modify annotation");
                }
                totalTaskDurationMs += Date.now() - taskStart;
                completed++;
                afterAnnotateItem("modify annotation");
            }, parallel, shouldContinue);

            updateLine("");
            if (isCancelled()) return false;
            if (tracker.failures) {
                throw new Error(
                    `Bulk modify annotation finished with ${tracker.failures}/${total} failures:\n${tracker.errors.slice(0, 5).join("\n")}`,
                );
            }
            return completeBulk(false);
        }

        if (annotateOptions.mode === "generate") {
            if (!request.llm?.modelId || !request.llm?.baseUrl) {
                throw new Error("LLM settings are incomplete");
            }

            const generateParallel = Math.max(1, request.llm.parallelCalls || 1);

            console.log(`Bulk annotate: ${generateParallel} parallel requests`);
            await limitedParallelMap(ids, async (id) => {
                if (aborted) return;
                const taskStart = Date.now();
                try {
                    const saved = await annotateImage(id, request.llm!, annotateOptions);
                    if (saved) {
                        markChanged(id);
                    } else {
                        recordAnnotateFailure(id, "empty result", "annotate");
                    }
                } catch (cause) {
                    const message = cause instanceof Error ? cause.message : String(cause);
                    recordAnnotateFailure(id, message, "annotate");
                }
                totalTaskDurationMs += Date.now() - taskStart;
                completed++;
                afterAnnotateItem("annotate");
            }, generateParallel, shouldContinue);

            updateLine("");
            if (isCancelled()) return false;
            if (tracker.failures) {
                throw new Error(
                    `Bulk annotate finished with ${tracker.failures}/${total} failures:\n${tracker.errors.slice(0, 5).join("\n")}`,
                );
            }
            return completeBulk(false);
        }

        const _exhaustive: never = annotateOptions.mode;
        throw new Error(`Unknown annotate mode: ${_exhaustive}`);
    }

    if (request.action.type === "tag") {
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            if (isCancelled()) break;
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            bulkUpdateImageTags(chunk, request.action.mode, request.action.tags);
            for (const id of chunk) markChanged(id);
            done += chunk.length;
            onProgress(done, total);
            updateLine(`Bulk tag ${request.action.mode}: ${done}/${total}`);
        }
        updateLine("");
        return completeBulk(false);
    }

    if (request.action.type === "vectorize") {
        const vectorizeOptions = request.action;
        let completed = 0;
        let totalTaskDurationMs = 0;

        if (vectorizeOptions.mode === "clear") {
            console.log(`Bulk clear embeddings: ${ids.length} images`);
            EmbeddingDB.deleteAll(ids);
            for (const id of ids) markChanged(id);
            onProgress(total, total);
            updateLine("");
            return completeBulk(false);
        }

        if (vectorizeOptions.mode === "embed") {
            const tracker: BulkFailureTracker = { failures: 0, errors: [] };

            if (!request.embedding?.baseUrl || !isEmbeddingConfigured(request.embedding)) {
                throw new Error("Embedding settings are incomplete");
            }

            const workIds = filterVectorizeWorkIds(ids, vectorizeOptions.force);
            const workTotal = workIds.length;
            const skips = countVectorizeSkips(ids, vectorizeOptions.force);
            onProgress(completed, workTotal);

            if (workTotal === 0) {
                updateLine("");
                if (ids.length === 0) {
                    return completeBulk(false);
                }
                console.log(
                    `Bulk vectorize: nothing to embed`
                    + (skips.alreadyEmbedded ? ` (${skips.alreadyEmbedded} already embedded)` : "")
                    + (skips.noPreview ? ` (${skips.noPreview} videos without preview skipped)` : ""),
                );
                // Only error when every item was already embedded (nothing skipped for other reasons).
                if (skips.alreadyEmbedded > 0 && skips.noPreview === 0) {
                    throw new Error(
                        `All ${ids.length} matching image${ids.length === 1 ? "" : "s"} `
                        + `${ids.length === 1 ? "is" : "are"} already embedded. `
                        + `Enable "Force recompute existing embeddings" to vectorize again.`,
                    );
                }
                return completeBulk(false);
            }

            const batchSize = Math.max(1, request.embedding.apiBatch || 1);
            const mediaMarker = await fetchMediaMarkerForConfig(request.embedding);

            console.log(
                `Bulk vectorize: ${workTotal} images to embed`
                + (skips.alreadyEmbedded ? ` (${skips.alreadyEmbedded} already embedded, skipped)` : "")
                + (skips.noPreview ? ` (${skips.noPreview} videos without preview skipped)` : "")
                + `, ${batchSize} per API request`,
            );
            for (let i = 0; i < workIds.length; i += batchSize) {
                if (isCancelled()) break;
                const chunk = workIds.slice(i, i + batchSize);
                const taskStart = Date.now();
                const batchFailures = await vectorizeImageBatch(chunk, request.embedding, {
                    force: vectorizeOptions.force,
                    mediaMarker,
                });
                const failedIds = new Set(batchFailures.map((failure) => failure.id));
                for (const id of chunk) {
                    if (!failedIds.has(id)) markChanged(id);
                }
                if (batchFailures.length) {
                    const message = batchFailures[0]!.message;
                    tracker.lastError = message;
                    tracker.failures += batchFailures.length;
                    for (const failure of batchFailures) {
                        tracker.errors.push(`${failure.id}: ${message}`);
                    }
                    console.error(`Bulk vectorize failed (${batchFailures.length} images): ${message}`);
                }
                totalTaskDurationMs += Date.now() - taskStart;
                completed += chunk.length;
                onProgress(completed, workTotal, bulkProgressStats(tracker, totalTaskDurationMs));
                updateLine(`Bulk vectorize: completed ${completed}/${workTotal}`);

                if (shouldAbortBulkRun(tracker.failures, completed, workTotal)) {
                    updateLine("");
                    throwBulkAborted(tracker, completed);
                }
            }

            updateLine("");
            if (isCancelled()) return false;
            if (tracker.failures) {
                throw new Error(
                    `Bulk vectorize finished with ${tracker.failures}/${workTotal} failures:\n${tracker.errors.slice(0, 5).join("\n")}`,
                );
            }
            return completeBulk(false);
        }

        const _exhaustive: never = vectorizeOptions.mode;
        throw new Error(`Unknown vectorize mode: ${_exhaustive}`);
    }

    throw new Error("Unknown bulk action");
    } finally {
        if (broadcastMetadataChange && changedIds.size > 0) {
            notifyMetadataChange([...changedIds]);
        }
    }
}
