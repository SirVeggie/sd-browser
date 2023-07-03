import { page } from "$app/stores";
import { log } from "$lib/tools/logger";
import { doServerGet } from "$lib/tools/requests";
import type { ImageList } from "$lib/types";
import { get, writable } from "svelte/store";

export const imageStore = writable<ImageList>({});

export async function fetchImages() {
    try {
        log('Loading images...');
        const res = await doServerGet(`${get(page).url.origin}/api/images`);
        if ('error' in res) {
            return log(res.error);
        }
        imageStore.set(res);
    } catch (e: any) {
        log(e.toString());
    }
}