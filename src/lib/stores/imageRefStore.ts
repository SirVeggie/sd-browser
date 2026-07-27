import { get, writable } from "svelte/store";
import {
    isGalleryImageEmbeddingId,
    isImageEmbeddingId,
    isTempImageEmbeddingId,
} from "../tools/searchParsing";
import {
    collectTempImageIdsFromSearch,
    encodeFloat32Embedding,
    type TempEmbeddingsMap,
} from "../tools/tempEmbeddings";

export const MAX_IMAGE_SEARCH_REFS = 20;
export {
    GALLERY_IMAGE_EMBEDDING_ID_PATTERN as GALLERY_IMAGE_REF_ID_PATTERN,
    TEMP_IMAGE_EMBEDDING_ID_PATTERN as TEMP_IMAGE_REF_ID_PATTERN,
} from "../tools/searchParsing";

/** @deprecated Prefer isGalleryImageRefId / isImageSearchRefId */
export const IMAGE_REF_ID_PATTERN = /^[0-9a-f]{64}$/i;

export type ImageSearchRef = {
    slot: number;
    id: string;
    /** Required for `temp:…` refs; omitted for gallery hex ids. */
    embedding?: number[];
    /** Optional data-URL thumbnail for `temp:…` refs (persisted in localStorage). */
    preview?: string;
};

export const imageRefs = writable<ImageSearchRef[]>([]);

export function isGalleryImageRefId(id: string): boolean {
    return isGalleryImageEmbeddingId(id);
}

export function isTempImageRefId(id: string): boolean {
    return isTempImageEmbeddingId(id);
}

export function isImageSearchRefId(id: string): boolean {
    return isImageEmbeddingId(id);
}

function isValidEmbedding(value: unknown): value is number[] {
    return Array.isArray(value)
        && value.length > 0
        && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isValidPreviewDataUrl(value: unknown): value is string {
    return typeof value === "string"
        && value.startsWith("data:image/")
        && value.length > "data:image/".length
        && value.length < 500_000;
}

export function getNextAvailableSlot(refs: ImageSearchRef[]): number {
    const used = new Set(refs.map((ref) => ref.slot));
    let slot = 1;
    while (used.has(slot))
        slot++;
    return slot;
}

export function normalizeImageSearchRefs(value: unknown): ImageSearchRef[] {
    if (!Array.isArray(value))
        return [];

    const seenIds = new Set<string>();
    const seenSlots = new Set<number>();
    const refs: ImageSearchRef[] = [];

    for (const item of value) {
        if (!item || typeof item !== "object")
            continue;

        const { slot, id, embedding, preview } = item as ImageSearchRef;
        if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 1 || slot > MAX_IMAGE_SEARCH_REFS)
            continue;
        if (typeof id !== "string" || !isImageSearchRefId(id))
            continue;

        const normalizedId = id.toLowerCase();
        if (seenIds.has(normalizedId) || seenSlots.has(slot))
            continue;

        if (isTempImageRefId(normalizedId)) {
            if (!isValidEmbedding(embedding))
                continue;
            seenIds.add(normalizedId);
            seenSlots.add(slot);
            const ref: ImageSearchRef = { slot, id: normalizedId, embedding: [...embedding] };
            if (isValidPreviewDataUrl(preview))
                ref.preview = preview;
            refs.push(ref);
            continue;
        }

        seenIds.add(normalizedId);
        seenSlots.add(slot);
        refs.push({ slot, id: normalizedId });
    }

    refs.sort((a, b) => a.slot - b.slot);
    return refs.slice(0, MAX_IMAGE_SEARCH_REFS);
}

export function addImageRefs(ids: string[]): {
    added: ImageSearchRef[];
    skippedDuplicates: string[];
    skippedCap: string[];
} {
    const added: ImageSearchRef[] = [];
    const skippedDuplicates: string[] = [];
    const skippedCap: string[] = [];

    imageRefs.update((refs) => {
        const next = [...refs];
        const existingIds = new Set(next.map((ref) => ref.id.toLowerCase()));

        for (const rawId of ids) {
            if (!isGalleryImageRefId(rawId))
                continue;

            const id = rawId.toLowerCase();
            if (existingIds.has(id)) {
                skippedDuplicates.push(id);
                continue;
            }

            if (next.length >= MAX_IMAGE_SEARCH_REFS) {
                skippedCap.push(id);
                continue;
            }

            const slot = getNextAvailableSlot(next);
            const ref = { slot, id };
            next.push(ref);
            existingIds.add(id);
            added.push(ref);
        }

        next.sort((a, b) => a.slot - b.slot);
        return next;
    });

    return { added, skippedDuplicates, skippedCap };
}

export function addCustomImageRef(entry: {
    id: string;
    embedding: number[];
    preview?: string;
}): {
    added: ImageSearchRef | undefined;
    skippedDuplicate: boolean;
    skippedCap: boolean;
} {
    const id = entry.id.toLowerCase();
    if (!isTempImageRefId(id) || !isValidEmbedding(entry.embedding)) {
        return { added: undefined, skippedDuplicate: false, skippedCap: false };
    }

    let added: ImageSearchRef | undefined;
    let skippedDuplicate = false;
    let skippedCap = false;

    imageRefs.update((refs) => {
        if (refs.some((ref) => ref.id.toLowerCase() === id)) {
            skippedDuplicate = true;
            return refs;
        }
        if (refs.length >= MAX_IMAGE_SEARCH_REFS) {
            skippedCap = true;
            return refs;
        }

        const slot = getNextAvailableSlot(refs);
        added = { slot, id, embedding: [...entry.embedding] };
        if (isValidPreviewDataUrl(entry.preview))
            added.preview = entry.preview;
        const next = [...refs, added];
        next.sort((a, b) => a.slot - b.slot);
        return next;
    });

    return { added, skippedDuplicate, skippedCap };
}

export function removeImageRef(slot: number): void {
    imageRefs.update((refs) => refs.filter((ref) => ref.slot !== slot));
}

export function removeImageRefById(id: string): void {
    const normalizedId = id.toLowerCase();
    imageRefs.update((refs) => refs.filter((ref) => ref.id.toLowerCase() !== normalizedId));
}

export function clearImageRefs(): void {
    imageRefs.set([]);
}

export function getImageRefBySlot(slot: number): ImageSearchRef | undefined {
    return get(imageRefs).find((ref) => ref.slot === slot);
}

export function getImageRefMap(): Map<number, string> {
    return new Map(get(imageRefs).map((ref) => [ref.slot, ref.id]));
}

/** Sidecar map of custom ref vectors for search/match/bulk requests (base64 Float32). */
export function getTempEmbeddingsMap(searchText?: string): TempEmbeddingsMap | undefined {
    const needed = searchText === undefined
        ? null
        : collectTempImageIdsFromSearch(searchText);
    if (needed && needed.size === 0)
        return undefined;

    const out: TempEmbeddingsMap = {};
    for (const ref of get(imageRefs)) {
        if (!isTempImageRefId(ref.id) || !isValidEmbedding(ref.embedding))
            continue;
        if (needed && !needed.has(ref.id.toLowerCase()))
            continue;
        out[ref.id] = encodeFloat32Embedding(ref.embedding);
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function syncImageRefsWithLocalStorage() {
    const name = "imageSearchRefs";

    if (localStorage.getItem(name)) {
        const value = JSON.parse(localStorage.getItem(name) || "");
        imageRefs.set(normalizeImageSearchRefs(value));
    }

    imageRefs.subscribe((refs) => {
        try {
            localStorage.setItem(name, JSON.stringify(refs));
        } catch {
            // Quota exceeded: persist without large preview data-URLs.
            const slim = refs.map((ref) => {
                if (!ref.preview)
                    return ref;
                const { preview: _preview, ...rest } = ref;
                return rest;
            });
            try {
                localStorage.setItem(name, JSON.stringify(slim));
            } catch {
                // Leave previous localStorage value if even slim refs fail.
            }
        }
    });
}
