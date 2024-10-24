import type { ClientImage } from "$lib/types/misc";
import { writable } from "svelte/store";

export const imageStore = writable<ClientImage[]>([]);
export const imageAmountStore = writable(0);