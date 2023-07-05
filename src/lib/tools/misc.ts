import type { ClientImage } from "$lib/types";

export function mapImagesToClient(ids: string[]): ClientImage[] {
    return ids.map(id => ({
        id,
        url: `/api/images/${id}`,
    }));
}

export function validRegex(str: string): boolean {
    try {
        new RegExp(str);
        return true;
    } catch {
        return false;
    }
}