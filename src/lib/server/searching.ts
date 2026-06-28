import { parseSearchDate, validRegex, XOR } from "$lib/tools/misc";
import type { ServerImage } from "$lib/types/images";
import {
    searchKeywords,
    type ExplorationSettings,
    type MatchType,
    type SearchMode,
    type SortingMethod,
} from "$lib/types/misc";
import _ from "lodash";
import { MetaDB } from "./db";
import { getExplorationPool, getNewestLibraryImage } from "./exploration";
import { getFreshImages, getImageList } from "./filemanager";
import { ModelIndex } from "./modelIndex";

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
const skipRegex = new RegExp(`^${keywordPattern}SKIP `, keywordFlags);
const andSplitRegex = /\s+AND\s+/i;
const skipCountRegex = /^\d+$/;

function splitSearchParts(search: string): string[] {
    return search.split(andSplitRegex);
}

type SearchPart = {
    raw: string;
    regex: RegExp;
    not: RegExpMatchArray | null;
    type: MatchType;
    matchingIds: Set<string> | undefined;
    skip: boolean;
};

export type SearchOptions = {
    timestamp?: number;
    sorting?: SortingMethod;
    skipResults?: boolean;
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

    const matcher = buildMatcher(search, matching);
    const filter = buildMatcher(filters.join(' AND '), 'regex');
    const pool = getExplorationPool(exploration);
    let list = filterPoolImages(pool, matcher, filter, options.timestamp);

    if (options.sorting === 'date')
        list = applyLatestImageException(list, pool, matcher, filter, options.timestamp);

    if (options.sorting)
        list = sortImages(list, options.sorting);

    if (options.skipResults !== false)
        list = applyResultSkip(list, search);

    return list;
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
    pool: Set<string>,
    matcher: (image: ServerImage) => boolean,
    filter: (image: ServerImage) => boolean,
    timestamp?: number,
): ServerImage[] {
    const newest = getNewestLibraryImage();
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

export function buildMatcher(search: string, matching: SearchMode): (image: ServerImage) => boolean {
    const regexes = splitSearchParts(search).map(x => {
        const raw = x.replace(removeRegex, '');
        const skip = skipRegex.test(x);

        if (skip && skipCountRegex.test(raw.trim())) {
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

        const part = {
            raw,
            regex: new RegExp(raw, 'is'),
            not: x.match(notRegex),
            type,
            matchingIds: undefined as Set<string> | undefined,
            skip,
        };

        if (type === 'model')
            part.matchingIds = ModelIndex.getImageIdsForSearch(raw, matching);

        return part;
    }).filter((x): x is SearchPart => x !== undefined)
        .sort((a, b) => getSearchPartRank(a) - getSearchPartRank(b));

    return (image: ServerImage) => {
        return regexes.every(x => {
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

            if (x.type === 'model') {
                return XOR(x.not, x.matchingIds!.has(image.id));
            }

            const text = getTextByType(image, x.type);
            const matched = textMatches(text, x, matching);

            if (x.skip)
                return !matched;

            return XOR(x.not, matched);
        });
    };
}

export function applyResultSkip(images: ServerImage[], search: string): ServerImage[] {
    const skipCount = getResultSkipCount(search);
    if (!skipCount) return images;
    return images.slice(skipCount);
}

function getResultSkipCount(search: string): number {
    return splitSearchParts(search).reduce((total, part) => {
        if (!skipRegex.test(part)) return total;

        const raw = part.replace(removeRegex, '').trim();
        if (!skipCountRegex.test(raw)) return total;

        return total + Number(raw);
    }, 0);
}

function getSearchPartRank(part: SearchPart): number {
    if (part.type === 'date') return 0;
    if (part.type === 'folder') return 1;
    if (part.type === 'model') return 2;
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
            return '';
        case 'annotation':
            return image.annotation ?? '';
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
        explorationMode: request.explorationMode,
        sparseFrequency: request.sparseFrequency,
        similarityAlgorithm: request.similarityAlgorithm,
        similarityThreshold: request.similarityThreshold,
    };
}
