import { getActiveCustomFilterStrings } from "$lib/stores/customFiltersStore";
import { combineSearchQuery } from "$lib/tools/searchQuery";
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
    matching: SearchMode;
    explorationMode: ExplorationMode;
    sparseFrequency: number;
    similarityAlgorithm: SimilarityAlgorithm;
    similarityThreshold: number;
};

export const nsfwFilterDefault = 'NOT FOLDER nsfw AND NOT nude|sex|seductive|underwear|pussy|cum|fellatio|ahegao|lust|crotch|vagina|penis|blow ?job|hentai|nipple|rating_explicit|rating_questionable';

export const searchFilter = writable('');
export const nsfwFilter = writable(nsfwFilterDefault);
export const showNsfwFilter = writable(true);
export const nsfwMode = writable(false);
export const thumbMode = writable<QualityMode>('low');
export const compressedMode = writable<QualityMode>('original');
export const animatedThumb = writable<boolean>(false);
export const explorationMode = writable<ExplorationMode>(defaultExplorationSettings.explorationMode);
export const sparseFrequency = writable(defaultExplorationSettings.sparseFrequency);
export const similarityAlgorithm = writable<SimilarityAlgorithm>(defaultExplorationSettings.similarityAlgorithm);
export const similarityThreshold = writable(defaultExplorationSettings.similarityThreshold);
export const matchingMode = writable<SearchMode>('regex');
export const initialImages = writable(500);
export const slideDelay = writable(4000);
export const useSmartSubsampling = writable(true);

export function buildSearchParams(searchText?: string): SearchParams {
    const filters: string[] = [];
    const algorithm = get(similarityAlgorithm);
    if (get(showNsfwFilter) && !get(nsfwMode) && get(nsfwFilter)) filters.push(get(nsfwFilter));
    filters.push(...getActiveCustomFilterStrings());
    const search = combineSearchQuery(searchText ?? get(searchFilter), filters);
    return {
        search,
        matching: get(matchingMode),
        explorationMode: coerceExplorationMode(get(explorationMode)),
        sparseFrequency: get(sparseFrequency),
        similarityAlgorithm: isSimilarityAlgorithm(algorithm) ? algorithm : defaultExplorationSettings.similarityAlgorithm,
        similarityThreshold: get(similarityThreshold),
    };
}

export function syncSearchInput(input: HTMLInputElement | undefined, store: Writable<string> = searchFilter) {
    if (!input) return;
    const value = input.dataset.canonicalValue ?? input.value;
    if (value !== get(store)) {
        store.set(value);
    }
}

export function syncSearchWithLocalStorage() {
    syncMemory('nsfwFilter', nsfwFilter, true);
    syncMemory('showNsfwFilter', showNsfwFilter);
    syncMemory('nsfwMode', nsfwMode);
    syncMemory('webpMode', thumbMode);
    syncMemory('compressedMode', compressedMode);
    syncMemory('animatedThumb', animatedThumb);
    syncMemory('explorationMode', explorationMode);
    syncMemory('sparseFrequency', sparseFrequency, true);
    syncMemory('similarityAlgorithm', similarityAlgorithm, true);
    syncMemory('similarityThreshold', similarityThreshold, true);
    syncMemory('matchingMode', matchingMode);
    syncMemory('initialImages', initialImages);
    syncMemory('slideDelay', slideDelay);
    syncMemory('useSmartSubsampling', useSmartSubsampling);
}