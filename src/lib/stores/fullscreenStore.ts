import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export const fullscreenState = writable(false);

export function syncFullscreenWithLocalStorage() {
    syncMemory('fullscreenState', fullscreenState);
}