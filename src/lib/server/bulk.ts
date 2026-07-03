import { limitedParallelMap, updateLine } from "$lib/tools/misc";
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

function shouldAbortBulkRun(failures: number, total: number): boolean {
    return failures > total * BULK_FAILURE_ABORT_RATIO;
}

function throwBulkAborted(tracker: BulkFailureTracker): never {
    throw new Error(
        `Stopped after ${tracker.failures} errors (>50% failure rate): ${tracker.lastError ?? "Unknown error"}`,
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
        request.filters,
        request.matching,
        explorationFromRequest(request),
        { sorting: request.sorting },
    );
    return images.images.map((image) => image.id);
}

function filterVectorizeWorkIds(ids: string[], force: boolean): string[] {
    return ids.filter((id) => {
        if (!getImage(id)) return false;
        return force || !EmbeddingDB.hasImageEmbedding(id);
    });
}

export async function runBulkAction(
    request: BulkRequest,
    onProgress: (done: number, total: number, stats?: BulkProgressStats) => void,
): Promise<boolean> {
    const ids = await resolveBulkImageIds(request);
    const total = ids.length;
    let done = 0;

    onProgress(done, total);
    const searchLabel = request.search ? `"${request.search}"` : "(no search term)";
    console.log(`Bulk ${request.action.type}: processing ${total} images, search=${searchLabel}`);

    if (request.action.type === "delete") {
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            await deleteImages(chunk);
            done += chunk.length;
            onProgress(done, total);
            updateLine(`Bulk delete: ${done}/${total}`);
        }
        updateLine("");
        return true;
    }

    if (request.action.type === "move") {
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            await moveImages(chunk, request.action.folder);
            done += chunk.length;
            onProgress(done, total);
            updateLine(`Bulk move: ${done}/${total}`);
        }
        updateLine("");
        return false;
    }

    if (request.action.type === "copy") {
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            await copyImages(chunk, request.action.folder);
            done += chunk.length;
            onProgress(done, total);
            updateLine(`Bulk copy: ${done}/${total}`);
        }
        updateLine("");
        return false;
    }

    if (request.action.type === "annotate") {
        const annotateOptions = request.action;
        let completed = 0;
        let failures = 0;
        const errors: string[] = [];

        let totalTaskDurationMs = 0;

        const parallel = Math.max(1, request.llm?.parallelCalls || 8);

        if (annotateOptions.mode === "clear") {
            console.log(`Bulk clear annotation: ${parallel} parallel workers`);
            await limitedParallelMap(ids, async (id) => {
                const taskStart = Date.now();
                try {
                    clearAnnotation(id);
                } catch (cause) {
                    failures++;
                    const message = cause instanceof Error ? cause.message : String(cause);
                    errors.push(`${id}: ${message}`);
                    console.error(`Bulk clear annotation failed: ${message}`);
                }
                totalTaskDurationMs += Date.now() - taskStart;
                completed++;
                onProgress(completed, total, { totalTaskDurationMs, failures });
                console.log(`Bulk clear annotation: completed ${completed}/${total}`);
                updateLine(`Bulk clear annotation: completed ${completed}/${total}`);
            }, parallel);

            updateLine("");
            if (failures) {
                throw new Error(`Bulk clear annotation finished with ${failures}/${total} failures:\n${errors.slice(0, 5).join("\n")}`);
            }
            notifyMetadataChange(ids);
            return false;
        }

        if (annotateOptions.mode === "modify") {
            console.log(`Bulk modify annotation: ${parallel} parallel workers`);
            await limitedParallelMap(ids, async (id) => {
                const taskStart = Date.now();
                try {
                    const saved = modifyAnnotation(id, annotateOptions);
                    if (!saved) {
                        failures++;
                        errors.push(`${id}: empty result`);
                        console.error(`Bulk modify annotation failed: ${id}: empty result`);
                    }
                } catch (cause) {
                    failures++;
                    const message = cause instanceof Error ? cause.message : String(cause);
                    errors.push(`${id}: ${message}`);
                    console.error(`Bulk modify annotation failed: ${message}`);
                }
                totalTaskDurationMs += Date.now() - taskStart;
                completed++;
                onProgress(completed, total, { totalTaskDurationMs, failures });
                console.log(`Bulk modify annotation: completed ${completed}/${total}`);
                updateLine(`Bulk modify annotation: completed ${completed}/${total}`);
            }, parallel);

            updateLine("");
            if (failures) {
                throw new Error(`Bulk modify annotation finished with ${failures}/${total} failures:\n${errors.slice(0, 5).join("\n")}`);
            }
            notifyMetadataChange(ids);
            return false;
        }

        if (annotateOptions.mode === "generate") {
            if (!request.llm?.modelId || !request.llm?.baseUrl) {
                throw new Error("LLM settings are incomplete");
            }

            const generateParallel = Math.max(1, request.llm.parallelCalls || 1);

            console.log(`Bulk annotate: ${generateParallel} parallel requests`);
            await limitedParallelMap(ids, async (id) => {
                const taskStart = Date.now();
                try {
                    const saved = await annotateImage(id, request.llm!, annotateOptions);
                    if (!saved) {
                        failures++;
                        errors.push(`${id}: empty result`);
                        console.error(`Bulk annotate failed: ${id}: empty result`);
                    }
                } catch (cause) {
                    failures++;
                    const message = cause instanceof Error ? cause.message : String(cause);
                    errors.push(`${id}: ${message}`);
                    console.error(`Bulk annotate failed: ${message}`);
                }
                totalTaskDurationMs += Date.now() - taskStart;
                completed++;
                onProgress(completed, total, { totalTaskDurationMs, failures });
                console.log(`Bulk annotate: completed ${completed}/${total}`);
                updateLine(`Bulk annotate: completed ${completed}/${total}`);
            }, generateParallel);

            updateLine("");
            if (failures) {
                throw new Error(`Bulk annotate finished with ${failures}/${total} failures:\n${errors.slice(0, 5).join("\n")}`);
            }
            notifyMetadataChange(ids);
            return false;
        }

        const _exhaustive: never = annotateOptions.mode;
        throw new Error(`Unknown annotate mode: ${_exhaustive}`);
    }

    if (request.action.type === "tag") {
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            bulkUpdateImageTags(chunk, request.action.mode, request.action.tags);
            done += chunk.length;
            onProgress(done, total);
            updateLine(`Bulk tag ${request.action.mode}: ${done}/${total}`);
        }
        updateLine("");
        notifyMetadataChange(ids);
        return false;
    }

    if (request.action.type === "vectorize") {
        const vectorizeOptions = request.action;
        let completed = 0;
        let totalTaskDurationMs = 0;

        if (vectorizeOptions.mode === "clear") {
            console.log(`Bulk clear embeddings: ${ids.length} images`);
            EmbeddingDB.deleteAll(ids);
            onProgress(total, total);
            updateLine("");
            return false;
        }

        if (vectorizeOptions.mode === "embed") {
            const tracker: BulkFailureTracker = { failures: 0, errors: [] };

            if (!request.embedding?.baseUrl || !isEmbeddingConfigured(request.embedding)) {
                throw new Error("Embedding settings are incomplete");
            }

            const workIds = filterVectorizeWorkIds(ids, vectorizeOptions.force);
            const workTotal = workIds.length;
            onProgress(completed, workTotal);

            if (workTotal === 0) {
                updateLine("");
                return false;
            }

            const batchSize = Math.max(1, request.embedding.apiBatch || 1);
            const mediaMarker = await fetchMediaMarkerForConfig(request.embedding);
            const skipped = ids.length - workTotal;

            console.log(
                `Bulk vectorize: ${workTotal} images to embed`
                + (skipped ? ` (${skipped} already embedded, skipped)` : "")
                + `, ${batchSize} per API request`,
            );
            for (let i = 0; i < workIds.length; i += batchSize) {
                const chunk = workIds.slice(i, i + batchSize);
                const taskStart = Date.now();
                const batchFailures = await vectorizeImageBatch(chunk, request.embedding, {
                    force: vectorizeOptions.force,
                    mediaMarker,
                });
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

                if (shouldAbortBulkRun(tracker.failures, workTotal)) {
                    updateLine("");
                    throwBulkAborted(tracker);
                }
            }

            updateLine("");
            if (tracker.failures) {
                throw new Error(
                    `Bulk vectorize finished with ${tracker.failures}/${workTotal} failures:\n${tracker.errors.slice(0, 5).join("\n")}`,
                );
            }
            return false;
        }

        const _exhaustive: never = vectorizeOptions.mode;
        throw new Error(`Unknown vectorize mode: ${_exhaustive}`);
    }

    throw new Error("Unknown bulk action");
}
