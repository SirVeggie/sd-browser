import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export const nsfwFilterDefault = 'NOT FOLDER nsfw AND NOT \\b(nude|sex|pussy|cum|fellatio|ahegao|lust|crotch|vagina|penis|blow ?job)\\b';
export const folderFilterDefault = 'NOT FOLDER grid AND NOT FOLDER img2img';

export const searchFilter = writable('');
export const nsfwFilter = writable(nsfwFilterDefault);
export const nsfwMode = writable(false);
export const folderFilter = writable(folderFilterDefault);
export const folderMode = writable(true);
export const thumbMode = writable(true);
export const compressedMode = writable(false);
export const collapseMode = writable(false);

export function syncSearchWithLocalStorage() {
    syncMemory('nsfwFilter', nsfwFilter);
    syncMemory('nsfwMode', nsfwMode);
    syncMemory('folderFilter', folderFilter);
    syncMemory('folderMode', folderMode);
    syncMemory('webpMode', thumbMode);
    syncMemory('compressedMode', compressedMode);
    syncMemory('collapseMode', collapseMode);
}