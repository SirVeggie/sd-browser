import { parseSearchDate, validRegex, XOR, yieldToEventLoop } from "$lib/tools/misc";
import { getModelSearchText, similarityPromptText } from "$lib/tools/metadataInterpreter";
import type { ServerImage } from "$lib/types/images";
import {
    coerceExplorationMode,
    defaultExplorationSettings,
    searchKeywords,
    type ExplorationSettings,
    type MatchType,
    type SearchMode,
    type SortingMethod,
} from "$lib/types/misc";
import _ from "lodash";
import { MetaDB } from "./db";
import { computeSimilarity, getExplorationPool } from "./exploration";
import { getFreshImages, getImageList } from "./filemanager";

const keywordPattern = `((${searchKeywords.join('|')}) )*`;
const keywordFlags = 'i';

const removeRegex = new RegExp(`^${keywordPattern}`, keywordFlags);
const notRegex = new RegExp(`^${keywordPattern}NOT `, keywordFlags);
const allRegex = new RegExp(`^${keywordPattern}ALL `, keywordFlags);
const negativeRegex = new RegExp(`^${keywordPattern}(NEGATIVE|NEG) `, keywordFlags);
const folderRegex = new RegExp(`^${keywordPattern}(FOLDER|FD) `, keywordFlags);
const paramRegex = new RegExp(`^${keywordPattern}(PARAMS|PR) `, keywordFlags);
const dateRegex = new RegExp(`^${keywordPattern}(DATE|DT) `, keywordFlags);
const modelRegex = new RegExp(`^${keywordPattern}(MODEL|MD) `, keywordFlags);
const annotationRegex = new RegExp(`^${keywordPattern}(ANNOTATION|AN) `, keywordFlags);
const similarRegex = new RegExp(`^${keywordPattern}(SIMILAR|SM) `, keywordFlags);
const skipRegex = new RegExp(`^${keywordPattern}SKIP `, keywordFlags);
const takeRegex = new RegExp(`^${keywordPattern}TAKE `, keywordFlags);
const andSplitRegex = /\s+AND\s+/i;
const resultCountRegex = /^\d+$/;

function splitSearchParts(search: string): string[] {
    return search.split(andSplitRegex);
}

type SearchPart = {
    raw: string;
    regex: RegExp;
    not: RegExpMatchArray | null;
    type: MatchType;
    skip: boolean;
    similarRef?: string;
    similarInvalid?: boolean;
};

export type SearchOptions = {
    timestamp?: number;
    sorting?: SortingMethod;
    skipResults?: boolean;
    takeResults?: boolean;
};

export function searchImages(
    search: string,
    filters: string[],
    matching: SearchMode,
    exploration: ExplorationSettings,
    options: SearchOptions = {},
) {
    if (matching === 'regex' && !validRegex(search))
        throw new Error('Invalid regex');

    const matcher = buildMatcher(search, matching, exploration);
    const filter = buildMatcher(filters.join(' AND '), 'regex');
    const imageList = getImageList();
    const images = [...imageList.values()];
    const pool = getExplorationPool(exploration, images);
    let list = filterPoolImages(pool, matcher, filter, options.timestamp);

    if (options.sorting === 'date')
        list = applyLatestImageException(list, images, pool, matcher, filter, options.timestamp);

    if (options.sorting)
        list = sortImages(list, options.sorting);

    if (options.skipResults !== false)
        list = applyResultSkip(list, search, options.sorting);

    if (options.takeResults !== false)
        list = applyResultTake(list, search, options.sorting);

    return list;
}

export type SearchStreamOptions = {
    /** Pool IDs scanned between event-loop yields (default 50). */
    yieldEvery?: number;
    /** Minimum ms between SSE chunks when matches are pending (default 100). */
    chunkIntervalMs?: number;
    /** Max images in the first SSE chunk, or when first-chunk min ms elapses (default 1000). */
    firstChunkMaxImages?: number;
    /** Wait up to this many ms before first chunk unless firstChunkMaxImages is reached first (default 100). */
    firstChunkMinMs?: number;
    /** Max images per subsequent SSE chunk (default 500). */
    maxChunkImages?: number;
    isAborted?: () => boolean;
};

export class SearchStreamAborted extends Error {
    constructor() {
        super('Search stream aborted');
        this.name = 'SearchStreamAborted';
    }
}

function throwIfSearchAborted(options: SearchStreamOptions): void {
    if (options.isAborted?.()) throw new SearchStreamAborted();
}

export type SearchStreamResult = {
    orderedIds: string[];
    amount: number;
};

export async function searchImagesStreaming(
    search: string,
    filters: string[],
    matching: SearchMode,
    exploration: ExplorationSettings,
    sorting: SortingMethod,
    onChunk: (images: ServerImage[], matched: number) => void,
    options: SearchStreamOptions = {},
): Promise<SearchStreamResult> {
    if (matching === 'regex' && !validRegex(search))
        throw new Error('Invalid regex');

    const yieldEvery = options.yieldEvery ?? 50;
    const chunkIntervalMs = options.chunkIntervalMs ?? 100;
    const firstChunkMaxImages = options.firstChunkMaxImages ?? 1000;
    const firstChunkMinMs = options.firstChunkMinMs ?? 100;
    const maxChunkImages = options.maxChunkImages ?? 500;
    await yieldToEventLoop();
    throwIfSearchAborted(options);

    const matcher = buildMatcher(search, matching, exploration);
    const filter = buildMatcher(filters.join(' AND '), 'regex');
    const imageList = getImageList();
    const images = [...imageList.values()];
    await yieldToEventLoop();
    throwIfSearchAborted(options);

    const pool = getExplorationPool(exploration, images);
    await yieldToEventLoop();
    throwIfSearchAborted(options);

    const orderedPoolIds = orderPoolIds(pool, sorting);
    await yieldToEventLoop();
    throwIfSearchAborted(options);

    const skipThreshold = sorting === 'random' ? 0 : getResultSkipCount(search);
    const takeLimit = sorting === 'random' ? 0 : getResultTakeCount(search);

    const orderedIds: string[] = [];
    let batch: ServerImage[] = [];
    let skipped = 0;
    let scanned = 0;
    let lastChunkAt = 0;
    const scanStartedAt = Date.now();

    const emitFirstChunk = async () => {
        if (!batch.length || lastChunkAt !== 0) return;

        const take = Math.min(batch.length, firstChunkMaxImages);
        const chunk = batch.splice(0, take);
        onChunk(chunk, orderedIds.length);
        lastChunkAt = Date.now();
        await yieldToEventLoop();
    };

    const emitPendingChunk = async (forceAll = false) => {
        while (batch.length) {
            if (options.isAborted?.()) {
                batch = [];
                return;
            }

            const take = forceAll ? batch.length : Math.min(batch.length, maxChunkImages);
            const chunk = batch.splice(0, take);
            onChunk(chunk, orderedIds.length);
            lastChunkAt = Date.now();
            await yieldToEventLoop();

            if (!forceAll && batch.length) break;
        }
    };

    const maybeEmitByTime = async () => {
        if (lastChunkAt === 0) {
            if (!batch.length) return;
            const elapsed = Date.now() - scanStartedAt;
            if (orderedIds.length < firstChunkMaxImages && elapsed < firstChunkMinMs) return;
            await emitFirstChunk();
            return;
        }

        if (Date.now() - lastChunkAt < chunkIntervalMs) return;

        if (batch.length) {
            await emitPendingChunk();
        } else if (orderedIds.length > 0) {
            onChunk([], orderedIds.length);
            lastChunkAt = Date.now();
            await yieldToEventLoop();
        }
    };

    for (const id of orderedPoolIds) {
        if (++scanned % yieldEvery === 0) {
            await yieldToEventLoop();
            if (options.isAborted?.()) break;
            await maybeEmitByTime();
        }

        const value = imageList.get(id);
        if (!value || !matcher(value) || !filter(value)) continue;

        if (skipped < skipThreshold) {
            skipped++;
            continue;
        }

        orderedIds.push(value.id);
        batch.push(value);
        await maybeEmitByTime();

        if (takeLimit > 0 && orderedIds.length >= takeLimit)
            break;
    }

    if (options.isAborted?.()) {
        return { orderedIds: [], amount: 0 };
    }

    if (lastChunkAt === 0 && batch.length)
        await emitFirstChunk();

    await emitPendingChunk(true);

    if (options.isAborted?.()) {
        return { orderedIds: [], amount: 0 };
    }

    let finalImages = orderedIds
        .map((id) => imageList.get(id))
        .filter((image): image is ServerImage => !!image);

    if (sorting === 'date') {
        if (options.isAborted?.()) {
            return { orderedIds: [], amount: 0 };
        }

        const withException = applyLatestImageException(
            finalImages,
            images,
            pool,
            matcher,
            filter,
        );
        const existingIds = new Set(finalImages.map((image) => image.id));
        const added = withException.filter((image) => !existingIds.has(image.id));
        if (added.length) {
            if (!options.isAborted?.()) {
                onChunk(added, withException.length);
                await yieldToEventLoop();
            }
        }
        finalImages = withException;
    }

    return {
        orderedIds: finalImages.map((image) => image.id),
        amount: finalImages.length,
    };
}

function orderPoolIds(pool: Set<string>, sorting: SortingMethod): string[] {
    const imageList = getImageList();
    const ids = [...pool];

    if (sorting === 'random')
        return _.shuffle(ids);

    const poolImages = ids
        .map((id) => imageList.get(id))
        .filter((image): image is ServerImage => !!image);

    return sortImages(poolImages, sorting).map((image) => image.id);
}

function filterPoolImages(
    pool: Set<string>,
    matcher: (image: ServerImage) => boolean,
    filter: (image: ServerImage) => boolean,
    timestamp?: number,
): ServerImage[] {
    const imageList = getImageList();
    const list: ServerImage[] = [];

    if (timestamp) {
        for (const value of getFreshImages(timestamp)) {
            if (pool.has(value.id) && matcher(value) && filter(value))
                list.push(value);
        }
        return list;
    }

    for (const id of pool) {
        const value = imageList.get(id);
        if (value && matcher(value) && filter(value))
            list.push(value);
    }

    return list;
}

function applyLatestImageException(
    list: ServerImage[],
    images: ServerImage[],
    pool: Set<string>,
    matcher: (image: ServerImage) => boolean,
    filter: (image: ServerImage) => boolean,
    timestamp?: number,
): ServerImage[] {
    const newest = getNewestLibraryImage(images);
    if (!newest || pool.has(newest.id) || !matcher(newest) || !filter(newest))
        return list;
    if (list.some(image => image.id === newest.id))
        return list;

    if (timestamp) {
        const isFresh = getFreshImages(timestamp).some(image => image.id === newest.id);
        if (!isFresh)
            return list;
    }

    return [...list, newest];
}

function getNewestLibraryImage(images: ServerImage[]): ServerImage | undefined {
    let newest: ServerImage | undefined;
    for (const image of images) {
        if (!newest || image.modifiedDate > newest.modifiedDate)
            newest = image;
    }
    return newest;
}

export function buildMatcher(
    search: string,
    matching: SearchMode,
    exploration?: ExplorationSettings,
): (image: ServerImage) => boolean {
    const similaritySettings = exploration ?? defaultExplorationSettings;
    const regexes = splitSearchParts(search).map(x => {
        const raw = x.replace(removeRegex, '');
        const skip = skipRegex.test(x);
        const take = takeRegex.test(x);

        if (take) {
            return undefined;
        }

        if (skip && resultCountRegex.test(raw.trim())) {
            return undefined;
        }

        let type: MatchType = 'positive';
        if (skip) type = 'positive';
        else if (allRegex.test(x)) type = 'all';
        else if (negativeRegex.test(x)) type = 'negative';
        else if (folderRegex.test(x)) type = 'folder';
        else if (paramRegex.test(x)) type = 'params';
        else if (dateRegex.test(x)) type = 'date';
        else if (modelRegex.test(x)) type = 'model';
        else if (annotationRegex.test(x)) type = 'annotation';
        else if (similarRegex.test(x)) type = 'similar';

        let similarRef: string | undefined;
        let similarInvalid = false;
        if (type === 'similar') {
            const refImage = getImageList().get(raw.trim());
            if (!refImage) {
                similarInvalid = true;
            } else {
                similarRef = similarityPromptText(refImage);
            }
        }

        const part: SearchPart = {
            raw,
            regex: new RegExp(raw, 'is'),
            not: x.match(notRegex),
            type,
            skip,
            similarRef,
            similarInvalid,
        };

        return part;
    }).filter((x): x is SearchPart => x !== undefined)
        .sort((a, b) => getSearchPartRank(a) - getSearchPartRank(b));

    if (regexes.some(x => x.similarInvalid))
        return () => false;

    return (image: ServerImage) => {
        return regexes.every(x => {
            if (x.type === 'similar') {
                const similarity = computeSimilarity(
                    x.similarRef!,
                    similarityPromptText(image),
                    similaritySettings.similarityAlgorithm,
                );
                const matched = similarity >= similaritySettings.similarityThreshold;
                if (x.skip)
                    return !matched;
                return XOR(x.not, matched);
            }

            if (x.type === 'date') {
                if (x.raw.toLowerCase().startsWith('to ')) {
                    const end = parseSearchDate(x.raw.substring(3), 'end');
                    return image.modifiedDate <= end;
                } else {
                    const dates = x.raw.toLowerCase().split(' to ');
                    const start = parseSearchDate(dates[0], 'start');
                    const end = dates[1] ? parseSearchDate(dates[1], 'end') : undefined;
                    return image.modifiedDate >= start && (end === undefined || image.modifiedDate <= end);
                }
            }

            const text = getTextByType(image, x.type);
            const matched = textMatches(text, x, matching);

            if (x.skip)
                return !matched;

            return XOR(x.not, matched);
        });
    };
}

export function applyResultSkip(
    images: ServerImage[],
    search: string,
    sorting?: SortingMethod,
): ServerImage[] {
    if (sorting === 'random') return images;

    const skipCount = getResultSkipCount(search);
    if (!skipCount) return images;
    return images.slice(skipCount);
}

export function applyResultTake(
    images: ServerImage[],
    search: string,
    sorting?: SortingMethod,
): ServerImage[] {
    if (sorting === 'random') return images;

    const takeCount = getResultTakeCount(search);
    if (!takeCount) return images;
    return images.slice(0, takeCount);
}

function getResultSkipCount(search: string): number {
    return splitSearchParts(search).reduce((total, part) => {
        if (!skipRegex.test(part)) return total;

        const raw = part.replace(removeRegex, '').trim();
        if (!resultCountRegex.test(raw)) return total;

        return total + Number(raw);
    }, 0);
}

function getResultTakeCount(search: string): number {
    return splitSearchParts(search).reduce((total, part) => {
        if (!takeRegex.test(part)) return total;

        const raw = part.replace(removeRegex, '').trim();
        if (!resultCountRegex.test(raw)) return total;

        return total + Number(raw);
    }, 0);
}

function getSearchPartRank(part: SearchPart): number {
    if (part.type === 'date') return 0;
    if (part.type === 'folder') return 1;
    if (part.type === 'model') return 2;
    if (part.type === 'similar') return 3;
    if (part.skip) return 4;
    if (part.type === 'all') return 5;
    return 3;
}

function textMatches(text: string, part: SearchPart, matching: SearchMode): boolean {
    if (matching === 'contains') {
        return text.toLowerCase().includes(part.raw.toLowerCase());
    } else if (matching === 'words') {
        const words = part.raw.split(' ');
        return words.every(word => new RegExp(`\\b${word}\\b`, 'i').test(text));
    } else {
        return part.regex.test(text);
    }
}

function getTextByType(image: ServerImage, type: MatchType): string {
    if (!image) return '';

    switch (type) {
        case 'folder':
            return image.folder;
        case 'date':
            return String(image.modifiedDate);
        case 'positive':
            return image.positive;
        case 'negative':
            return image.negative;
        case 'params':
            return image.params;
        case 'all':
            return getFullMetaForImage(image.id);
        case 'model':
            return getModelSearchText(image.models);
        case 'annotation':
            return image.annotation ?? '';
        case 'similar':
            return '';
        default: {
            const _never: never = type;
            return _never;
        }
    }
}

function getFullMetaForImage(id: string): string {
    const image = MetaDB.get(id);
    return `${image?.prompt}\n${image?.workflow}\n${image?.extra}\n${image?.folder}`;
}

function createComparer<T>(selector: (a: T) => any, descending: boolean) {
    return (a: T, b: T) => {
        return selector(a) < selector(b)
            ? (descending ? 1 : -1)
            : selector(a) > selector(b)
                ? (descending ? -1 : 1)
                : 0;
    };
}

export function sortImages(images: ServerImage[], sort: SortingMethod): ServerImage[] {
    if (images.length === 0) return images;
    switch (sort) {
        case 'date':
            return [...images].sort(createComparer<ServerImage>(x => x.modifiedDate, true));
        case 'date (asc)':
            return [...images].sort(createComparer<ServerImage>(x => x.modifiedDate, false));
        case 'name':
            return [...images].sort(createComparer<ServerImage>(x => x.file, true));
        case 'name (desc)':
            return [...images].sort(createComparer<ServerImage>(x => x.file, false));
        case 'random':
            return _.shuffle(images);
        default: {
            const _never: never = sort;
            return _never;
        }
    }
}

export function explorationFromRequest(request: {
    explorationMode: ExplorationSettings['explorationMode'];
    sparseFrequency: number;
    similarityAlgorithm: ExplorationSettings['similarityAlgorithm'];
    similarityThreshold: number;
}): ExplorationSettings {
    return {
        explorationMode: coerceExplorationMode(request.explorationMode),
        sparseFrequency: request.sparseFrequency,
        similarityAlgorithm: request.similarityAlgorithm,
        similarityThreshold: request.similarityThreshold,
    };
}
