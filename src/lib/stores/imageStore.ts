import { syncMemory } from "$lib/tools/syncStorage";
import type { ClientImage } from "$lib/types";
import { writable } from "svelte/store";

export const imageStore = writable<ClientImage[]>([]);
export const imageAmountStore = writable(0);

export const stealthInfo = writable(false);

export function syncStealthInfoWithLocalStorage() {
    syncMemory('stealthInfo', stealthInfo);
}