import { notify } from "$lib/components/Notifier.svelte";
import { ensureImageEmbeddings } from "$lib/requests/imageRequests";
import { embeddingStore, isEmbeddingConfigured } from "$lib/stores/embeddingStore";
import {
    addImageRefs,
    MAX_IMAGE_SEARCH_REFS,
} from "$lib/stores/imageRefStore";
import { get } from "svelte/store";

export const IMAGE_DRAG_MIME = "application/x-sd-browser-image-id";

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
