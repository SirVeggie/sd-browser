import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export type ImageFlow = "grid" | "masonry";
export type ImageSpacing = "classic" | "compact" | "mosaic";

export const imageSpacing = writable<ImageSpacing>("classic");
export const imageFlow = writable<ImageFlow>("grid");
export const imageSize = writable("");
export const fullscreenStyle = writable(false);

export function syncStyleWithLocalStorage() {
    syncMemory("imageSpacing", imageSpacing);
    syncMemory("imageFlow", imageFlow);
    syncMemory("imageSize", imageSize);
    syncMemory("fullscreenStyle", fullscreenStyle);
}