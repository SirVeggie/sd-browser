import { limitedParallelMap, updateLine } from "$lib/tools/misc";
import type { BulkRequest } from "$lib/types/requests";
import { annotateImage, clearAnnotation } from "./llm";
import { copyImages, deleteImages, moveImages } from "./filemanager";
import { searchImages } from "./searching";

const CHUNK_SIZE = 100;

type BulkProgressStats = {
    totalTaskDurationMs: number;
    failures: number;
};

export async function runBulkAction(
    request: BulkRequest,
    onProgress: (done: number, total: number, stats?: BulkProgressStats) => void,
): Promise<boolean> {
    const images = searchImages(request.search, request.filters, request.matching, request.collapse);
    const ids = images.map((image) => image.id);
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

        if (annotateOptions.clearAnnotation) {
            const parallel = Math.max(1, request.llm?.parallelCalls || 8);
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
            return false;
        }

        if (!request.llm?.modelId || !request.llm?.baseUrl) {
            throw new Error("LLM settings are incomplete");
        }

        const parallel = Math.max(1, request.llm.parallelCalls || 1);

        console.log(`Bulk annotate: ${parallel} parallel requests`);
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
        }, parallel);

        updateLine("");
        if (failures) {
            throw new Error(`Bulk annotate finished with ${failures}/${total} failures:\n${errors.slice(0, 5).join("\n")}`);
        }
        return false;
    }

    throw new Error("Unknown bulk action");
}
