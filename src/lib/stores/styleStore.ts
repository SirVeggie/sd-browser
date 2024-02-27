import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export const seamlessStyle = writable(false);
export const imageSize = writable(0);

export function syncStyleWithLocalStorage() {
    syncMemory("seamlessStyle", seamlessStyle);
    syncMemory("imageSize", imageSize);
}