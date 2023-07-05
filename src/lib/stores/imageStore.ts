import type { ClientImage } from "$lib/types";
import { writable } from "svelte/store";

export const imageStore = writable<ClientImage[]>([]);
export const imageAmountStore = writable(0);