import { get, writable } from "svelte/store";

export const MAX_IMAGE_SEARCH_REFS = 20;
export const IMAGE_REF_ID_PATTERN = /^[0-9a-f]{64}$/i;

export type ImageSearchRef = { slot: number; id: string };

export const imageRefs = writable<ImageSearchRef[]>([]);

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

        const { slot, id } = item as ImageSearchRef;
        if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 1 || slot > MAX_IMAGE_SEARCH_REFS)
            continue;
        if (typeof id !== "string" || !IMAGE_REF_ID_PATTERN.test(id))
            continue;

        const normalizedId = id.toLowerCase();
        if (seenIds.has(normalizedId) || seenSlots.has(slot))
            continue;

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
            const id = rawId.toLowerCase();
            if (!IMAGE_REF_ID_PATTERN.test(id))
                continue;

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

export function removeImageRef(slot: number): void {
    imageRefs.update((refs) => refs.filter((ref) => ref.slot !== slot));
}

export function removeImageRefById(id: string): void {
    const normalizedId = id.toLowerCase();
    imageRefs.update((refs) => refs.filter((ref) => ref.id !== normalizedId));
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

export function syncImageRefsWithLocalStorage() {
    const name = "imageSearchRefs";

    if (localStorage.getItem(name)) {
        const value = JSON.parse(localStorage.getItem(name) || "");
        imageRefs.set(normalizeImageSearchRefs(value));
    }

    imageRefs.subscribe((refs) => {
        localStorage.setItem(name, JSON.stringify(refs));
    });
}
