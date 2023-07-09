import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export const nsfwFilterDefault = 'NOT FOLDER nsfw AND NOT \\b(nude|sex|pussy|cum|fellatio|ahegao|lust|crotch|vagina|penis|blow ?job)\\b';
export const folderFilterDefault = 'NOT FOLDER grid AND NOT FOLDER img2img';

export const nsfwFilter = writable(nsfwFilterDefault);
export const nsfwMode = writable(false);
export const folderFilter = writable(folderFilterDefault);
export const folderMode = writable(true);
export const webpMode = writable(true);

export function syncSearchWithLocalStorage() {
    syncMemory('nsfwFilter', nsfwFilter);
    syncMemory('nsfwMode', nsfwMode);
    syncMemory('folderFilter', folderFilter);
    syncMemory('folderMode', folderMode);
    syncMemory('webpMode', webpMode);
}