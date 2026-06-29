import { syncMemory } from "$lib/tools/syncStorage";
import {
    defaultExplorationSettings,
    coerceExplorationMode,
    isSimilarityAlgorithm,
    type ExplorationMode,
    type QualityMode,
    type SearchMode,
    type SimilarityAlgorithm,
} from "$lib/types/misc";
import { get, writable, type Writable } from "svelte/store";

export type SearchParams = {
    search: string;
    filters: string[];
    matching: SearchMode;
    explorationMode: ExplorationMode;
    sparseFrequency: number;
    similarityAlgorithm: SimilarityAlgorithm;
    similarityThreshold: number;
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
export const explorationMode = writable<ExplorationMode>(defaultExplorationSettings.explorationMode);
export const sparseFrequency = writable(defaultExplorationSettings.sparseFrequency);
export const similarityAlgorithm = writable<SimilarityAlgorithm>(defaultExplorationSettings.similarityAlgorithm);
export const similarityThreshold = writable(defaultExplorationSettings.similarityThreshold);
export const matchingMode = writable<SearchMode>('regex');
export const initialImages = writable(25);
export const slideDelay = writable(4000);

export function buildSearchParams(searchText?: string): SearchParams {
    const filters: string[] = [];
    const algorithm = get(similarityAlgorithm);
    if (!get(nsfwMode) && get(nsfwFilter)) filters.push(get(nsfwFilter));
    if (get(folderMode) && get(folderFilter)) filters.push(get(folderFilter));
    return {
        search: searchText ?? get(searchFilter),
        filters,
        matching: get(matchingMode),
        explorationMode: coerceExplorationMode(get(explorationMode)),
        sparseFrequency: get(sparseFrequency),
        similarityAlgorithm: isSimilarityAlgorithm(algorithm) ? algorithm : defaultExplorationSettings.similarityAlgorithm,
        similarityThreshold: get(similarityThreshold),
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
    syncMemory('explorationMode', explorationMode);
    syncMemory('sparseFrequency', sparseFrequency);
    syncMemory('similarityAlgorithm', similarityAlgorithm);
    syncMemory('similarityThreshold', similarityThreshold);
    syncMemory('matchingMode', matchingMode);
    syncMemory('initialImages', initialImages);
    syncMemory('slideDelay', slideDelay);
}