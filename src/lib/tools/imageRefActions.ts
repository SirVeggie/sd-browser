import { notify } from "$lib/components/Notifier.svelte";
import { createTempImageEmbedding, ensureImageEmbeddings } from "$lib/requests/imageRequests";
import { embeddingStore, isEmbeddingConfigured } from "$lib/stores/embeddingStore";
import {
    addCustomImageRef,
    addImageRefs,
    MAX_IMAGE_SEARCH_REFS,
} from "$lib/stores/imageRefStore";
import { fitImageToMaxTotalPixels } from "$lib/tools/imageGeometry";
import { get } from "svelte/store";

export const IMAGE_DRAG_MIME = "application/x-sd-browser-image-id";

const IMAGE_FILE_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/bmp",
]);

/** Max edge for persisted custom-ref thumbs (strip is 40px; modal is larger). */
const PREVIEW_MAX_EDGE = 256;
const PREVIEW_JPEG_QUALITY = 0.82;

/**
 * Match server llama embedding resize (`512*512` total pixels). Keeps multipart
 * uploads under adapter-node's default 512KB BODY_SIZE_LIMIT.
 */
const EMBED_UPLOAD_MAX_TOTAL_PIXELS = 512 * 512;
const EMBED_UPLOAD_JPEG_QUALITY = 0.9;

export async function addReferencesWithFeedback(ids: string[]): Promise<void> {
    const { added, skippedDuplicates, skippedCap } = addImageRefs(ids);

    if (skippedDuplicates.length > 0) {
        const count = skippedDuplicates.length;
        notify(
            count === 1 ? "Already a reference" : `Already a reference (${count})`,
            "warn",
        );
    }

    if (skippedCap.length > 0) {
        const count = skippedCap.length;
        notify(
            count === 1
                ? `Reference limit (${MAX_IMAGE_SEARCH_REFS}) reached`
                : `${count} not added — limit is ${MAX_IMAGE_SEARCH_REFS}`,
            "warn",
        );
    }

    if (added.length === 0) {
        return;
    }

    const embedding = get(embeddingStore);
    if (!isEmbeddingConfigured(embedding)) {
        notify("No embedding", "warn");
        return;
    }

    const results = await ensureImageEmbeddings(
        added.map((ref) => ref.id),
        {
            apiType: embedding.apiType,
            baseUrl: embedding.baseUrl,
            apiKey: embedding.apiKey || undefined,
            modelId: embedding.modelId,
            apiBatch: Math.max(1, embedding.apiBatch || 1),
            searchTemplate: embedding.searchTemplate,
        },
    );

    let created = 0;
    for (const result of results) {
        if (result.status === "created") {
            created++;
        } else if (result.status === "failed") {
            notify(result.error ?? "No embedding", "warn");
        }
    }

    if (created > 0) {
        notify(
            created === 1 ? "Embedding created" : `Embedding created (${created})`,
            "success",
        );
    }
}

export function isImageFile(file: File): boolean {
    if (file.type && IMAGE_FILE_TYPES.has(file.type.toLowerCase()))
        return true;
    return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
}

export function collectImageFiles(list: FileList | File[] | null | undefined): File[] {
    if (!list)
        return [];
    return [...list].filter(isImageFile);
}

export function collectClipboardImageFiles(clipboardData: DataTransfer | null): File[] {
    if (!clipboardData)
        return [];

    const files: File[] = [];
    for (const item of clipboardData.items) {
        if (item.kind !== "file" || !item.type.startsWith("image/"))
            continue;
        const file = item.getAsFile();
        if (file)
            files.push(file);
    }
    if (files.length > 0)
        return files;

    return collectImageFiles(clipboardData.files);
}

export function dataTransferHasImageFiles(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer)
        return false;
    if ([...dataTransfer.types].includes("Files"))
        return true;
    for (const item of dataTransfer.items) {
        if (item.kind === "file" && item.type.startsWith("image/"))
            return true;
    }
    return false;
}

/** Compact JPEG data-URL for localStorage-backed custom ref thumbs. */
export async function createImageRefPreviewDataUrl(file: Blob): Promise<string | undefined> {
    if (typeof createImageBitmap !== "function")
        return undefined;

    let bitmap: ImageBitmap | undefined;
    try {
        bitmap = await createImageBitmap(file);
        const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            return undefined;
        ctx.drawImage(bitmap, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", PREVIEW_JPEG_QUALITY);
    } catch {
        return undefined;
    } finally {
        bitmap?.close();
    }
}

/**
 * Downscale to embedding input size before upload so large camera/wallpaper
 * files do not hit SvelteKit's default 512KB body limit (413).
 */
export async function prepareImageFileForTempEmbed(file: File): Promise<File> {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined")
        return file;

    let bitmap: ImageBitmap | undefined;
    try {
        bitmap = await createImageBitmap(file);
        const target = fitImageToMaxTotalPixels(
            bitmap.width,
            bitmap.height,
            EMBED_UPLOAD_MAX_TOTAL_PIXELS,
        );
        const alreadySmallEnough =
            target.width === bitmap.width
            && target.height === bitmap.height
            && file.size <= 400_000
            && /image\/jpe?g/i.test(file.type);
        if (alreadySmallEnough)
            return file;

        const canvas = document.createElement("canvas");
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            return file;
        ctx.drawImage(bitmap, 0, 0, target.width, target.height);

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, "image/jpeg", EMBED_UPLOAD_JPEG_QUALITY);
        });
        if (!blob)
            return file;

        const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
    } catch {
        return file;
    } finally {
        bitmap?.close();
    }
}

export async function addCustomImageRefs(files: File[]): Promise<void> {
    const images = files.filter(isImageFile);
    if (images.length === 0) {
        return;
    }

    const embedding = get(embeddingStore);
    if (!isEmbeddingConfigured(embedding)) {
        notify("No embedding", "warn");
        return;
    }

    let addedCount = 0;
    let duplicateCount = 0;
    let capCount = 0;

    for (const file of images) {
        try {
            const upload = await prepareImageFileForTempEmbed(file);
            const result = await createTempImageEmbedding(upload, {
                filename: upload.name || "image.jpg",
            });
            const preview = await createImageRefPreviewDataUrl(file);
            const { added, skippedDuplicate, skippedCap } = addCustomImageRef({
                id: result.id,
                embedding: result.embedding,
                preview,
            });

            if (skippedDuplicate) {
                duplicateCount++;
                continue;
            }
            if (skippedCap) {
                capCount++;
                continue;
            }
            if (!added) {
                continue;
            }

            addedCount++;
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Failed to embed image";
            notify(message, "warn");
        }
    }

    if (duplicateCount > 0) {
        notify(
            duplicateCount === 1 ? "Already a reference" : `Already a reference (${duplicateCount})`,
            "warn",
        );
    }
    if (capCount > 0) {
        notify(
            capCount === 1
                ? `Reference limit (${MAX_IMAGE_SEARCH_REFS}) reached`
                : `${capCount} not added — limit is ${MAX_IMAGE_SEARCH_REFS}`,
            "warn",
        );
    }
    if (addedCount > 0) {
        notify(
            addedCount === 1 ? "Custom reference added" : `Custom references added (${addedCount})`,
            "success",
        );
    }
}

export function parseImageDragIds(dataTransfer: DataTransfer | null): string[] {
    if (!dataTransfer) {
        return [];
    }

    const raw = dataTransfer.getData(IMAGE_DRAG_MIME) || dataTransfer.getData("text/plain");
    if (!raw) {
        return [];
    }

    return raw.split(/\s+/).filter(Boolean);
}
