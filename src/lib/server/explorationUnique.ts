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

function findNewestIdForHash(images: ServerImage[], hash: string): string | undefined {
    let id: string | undefined;
    for (const image of sortByModifiedDate(images)) {
        if (image.hash === hash)
            id = image.id;
    }
    return id;
}

export function repairUniqueHashToIdAfterDeletes(
    hashToId: Record<string, string>,
    remaining: ServerImage[],
    deleted: ServerImage[],
): Record<string, string> {
    const result = { ...hashToId };
    for (const image of deleted) {
        if (!image.hash)
            continue;
        if (result[image.hash] !== image.id)
            continue;
        const replacement = findNewestIdForHash(remaining, image.hash);
        if (replacement)
            result[image.hash] = replacement;
        else
            delete result[image.hash];
    }
    return result;
}
