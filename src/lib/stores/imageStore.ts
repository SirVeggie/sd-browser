import type { ImageList } from "$lib/types";
import { writable } from "svelte/store";

export const imageStore = writable<ImageList>({});