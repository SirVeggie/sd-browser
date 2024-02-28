import { syncMemory } from "$lib/tools/syncStorage";
import type { QualityMode, SearchMode } from "$lib/types";
import { writable } from "svelte/store";

export const nsfwFilterDefault = 'NOT FOLDER nsfw AND NOT nude|sex|seductive|underwear|pussy|cum|fellatio|ahegao|lust|crotch|vagina|penis|blow ?job|hentai|nipple|rating_explicit|rating_questionable';
export const folderFilterDefault = 'NOT FOLDER img2img|grids|extras';

export const searchFilter = writable('');
export const nsfwFilter = writable(nsfwFilterDefault);
export const nsfwMode = writable(false);
export const folderFilter = writable(folderFilterDefault);
export const folderMode = writable(true);
export const thumbMode = writable<QualityMode>('low');
export const compressedMode = writable<QualityMode>('original');
export const collapseMode = writable(false);
export const matchingMode = writable<SearchMode>('regex');
export const initialImages = writable(25);
export const slideDelay = writable(4000);

export function syncSearchWithLocalStorage() {
    syncMemory('nsfwFilter', nsfwFilter);
    syncMemory('nsfwMode', nsfwMode);
    syncMemory('folderFilter', folderFilter);
    syncMemory('folderMode', folderMode);
    syncMemory('webpMode', thumbMode);
    syncMemory('compressedMode', compressedMode);
    syncMemory('collapseMode', collapseMode);
    syncMemory('matchingMode', matchingMode);
    syncMemory('initialImages', initialImages);
    syncMemory('slideDelay', slideDelay);
}