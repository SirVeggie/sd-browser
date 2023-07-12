import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export const seamlessStyle = writable(false);

export function syncStyleWithLocalStorage() {
    syncMemory("seamlessStyle", seamlessStyle);
}