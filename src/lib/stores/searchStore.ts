import { syncMemory } from "$lib/tools/syncStorage";
import type { QualityMode, SearchMode } from "$lib/types/misc";
import { get, writable, type Writable } from "svelte/store";

export type SearchParams = {
    search: string;
    filters: string[];
    matching: SearchMode;
    collapse: boolean;
};

export const nsfwFilterDefault = 'NOT FOLDER nsfw AND NOT nude|sex|seductive|underwear|pussy|cum|fellatio|ahegao|lust|crotch|vagina|penis|blow ?job|hentai|nipple|rating_explicit|rating_questionable';
export const folderFilterDefault = 'NOT FOLDER img2img|grids|extras';

export const searchFilter = writable('');
export const nsfwFilter = writable(nsfwFilterDefault);
export const nsfwMode = writable(false);
export const folderFilter = writable(folderFilterDefault);
export const folderMode = writable(true);
export const thumbMode = writable<QualityMode>('low');
export const compressedMode = writable<QualityMode>('original');
export const animatedThumb = writable<boolean>(false);
export const collapseMode = writable(false);
export const matchingMode = writable<SearchMode>('regex');
export const initialImages = writable(25);
export const slideDelay = writable(4000);

export function buildSearchParams(searchText?: string): SearchParams {
    const filters: string[] = [];
    if (!get(nsfwMode) && get(nsfwFilter)) filters.push(get(nsfwFilter));
    if (get(folderMode) && get(folderFilter)) filters.push(get(folderFilter));
    return {
        search: searchText ?? get(searchFilter),
        filters,
        matching: get(matchingMode),
        collapse: get(collapseMode),
    };
}

export function syncSearchInput(input: HTMLInputElement | undefined, store: Writable<string> = searchFilter) {
    if (!input) return;
    const value = input.value;
    if (value !== get(store)) {
        store.set(value);
    }
}

export function syncSearchWithLocalStorage() {
    syncMemory('nsfwFilter', nsfwFilter, true);
    syncMemory('nsfwMode', nsfwMode);
    syncMemory('folderFilter', folderFilter, true);
    syncMemory('folderMode', folderMode);
    syncMemory('webpMode', thumbMode);
    syncMemory('compressedMode', compressedMode);
    syncMemory('animatedThumb', animatedThumb);
    syncMemory('collapseMode', collapseMode);
    syncMemory('matchingMode', matchingMode);
    syncMemory('initialImages', initialImages);
    syncMemory('slideDelay', slideDelay);
}