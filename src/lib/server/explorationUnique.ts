import type { ServerImage } from "$lib/types/images";

export function sortByModifiedDate(images: ServerImage[]): ServerImage[] {
    return [...images].sort((a, b) => {
        if (a.modifiedDate !== b.modifiedDate)
            return a.modifiedDate - b.modifiedDate;
        return a.id.localeCompare(b.id);
    });
}

export function buildUniqueHashToId(images: ServerImage[]): Record<string, string> {
    const hashToId: Record<string, string> = {};
    for (const image of sortByModifiedDate(images)) {
        if (image.hash)
            hashToId[image.hash] = image.id;
    }
    return hashToId;
}

/** Same order as sortByModifiedDate: later date wins, then the larger id. */
function isNewer(image: ServerImage, than: ServerImage): boolean {
    if (image.modifiedDate !== than.modifiedDate)
        return image.modifiedDate > than.modifiedDate;
    return image.id.localeCompare(than.id) > 0;
}

/** Newest remaining image per hash, for the given hashes only, in one pass. */
function findNewestIdsForHashes(images: ServerImage[], hashes: Set<string>): Map<string, ServerImage> {
    const newest = new Map<string, ServerImage>();
    if (!hashes.size)
        return newest;
    for (const image of images) {
        if (!image.hash || !hashes.has(image.hash))
            continue;
        const current = newest.get(image.hash);
        if (!current || isNewer(image, current))
            newest.set(image.hash, image);
    }
    return newest;
}

/**
 * Repair hashToId in place after deletes. Keeps `pool` (the set of mapped ids) in step
 * when given.
 */
export function repairUniqueHashToIdAfterDeletesInPlace(
    hashToId: Record<string, string>,
    remaining: ServerImage[],
    deleted: ServerImage[],
    pool?: Set<string>,
): void {
    const affected = new Set<string>();
    for (const image of deleted) {
        if (image.hash && hashToId[image.hash] === image.id)
            affected.add(image.hash);
    }
    const replacements = findNewestIdsForHashes(remaining, affected);
    for (const hash of affected) {
        pool?.delete(hashToId[hash]);
        const replacement = replacements.get(hash);
        if (replacement) {
            hashToId[hash] = replacement.id;
            pool?.add(replacement.id);
        } else {
            delete hashToId[hash];
        }
    }
}

export function repairUniqueHashToIdAfterDeletes(
    hashToId: Record<string, string>,
    remaining: ServerImage[],
    deleted: ServerImage[],
): Record<string, string> {
    const result = { ...hashToId };
    repairUniqueHashToIdAfterDeletesInPlace(result, remaining, deleted);
    return result;
}
