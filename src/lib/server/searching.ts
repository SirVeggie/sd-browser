import { isVideo, parseSearchDate, parseSearchFloat, validRegex, XOR, yieldToEventLoop } from "$lib/tools/misc";
import { isExactTagTerm } from "$lib/types/tags";
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
import shuffle from "lodash/shuffle";
import { MetaDB } from "./db";
import { EmbeddingDB, EmbeddingDimensionMismatchError } from "./embeddingDb";
import { embedQuery, getServerEmbeddingSettings, isServerEmbeddingConfigured } from "./embeddings";
import { formatEmbeddingSearchQuery } from "$lib/types/embeddings";
import { computeSimilarity, getExplorationPool } from "./exploration";
import { getFreshImages, getImageList } from "./dataIndex";

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
const tagRegex = new RegExp(`^${keywordPattern}TAG `, keywordFlags);
const similarRegex = new RegExp(`^${keywordPattern}(SIMILAR|SM) `, keywordFlags);
const idRegex = new RegExp(`^${keywordPattern}ID `, keywordFlags);
const videoRegex = new RegExp(`^${keywordPattern}(VIDEO|VID) `, keywordFlags);
const videoOnlyRegex = new RegExp(`^${keywordPattern}(VIDEO|VID)$`, keywordFlags);
const imgRegex = new RegExp(`^${keywordPattern}IMG `, keywordFlags);
const imgOnlyRegex = new RegExp(`^${keywordPattern}IMG$`, keywordFlags);
/** Default similarity cutoff for IMG text queries (text query vs image embeddings). */
const IMAGE_EMBEDDING_SIMILARITY_THRESHOLD = 0.08;
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
    tagExact?: boolean;
    similarRef?: string;
    similarThreshold?: number;
    similarInvalid?: boolean;
    imgPresence?: boolean;
    imgMatchIds?: Set<string>;
    imgInvalid?: boolean;
    idTargets?: Set<string>;
    idInvalid?: boolean;
};

export type ImgSearchContext = {
    parts: Map<number, {
        presence: boolean;
        matchIds?: Set<string>;
        invalid?: boolean;
    }>;
    /** Combined similarity scores for IMG text queries (best match first). */
    matchScores?: Map<string, number>;
    /** User-facing message when a text IMG query could not run. */
    error?: string;
};

export const IMG_SEARCH_UNCONFIGURED_MESSAGE =
    'Configure the embedding API in Settings before using IMG search';

export function formatImgSearchFailure(cause: unknown): string {
    if (cause instanceof EmbeddingDimensionMismatchError)
        return cause.message;

    if (cause instanceof Error) {
        if (cause.name === 'TimeoutError' || /timed out/i.test(cause.message))
            return 'Embedding API request timed out';

        if (/fetch failed|network|ECONNREFUSED|ENOTFOUND|ECONNRESET|socket hang up/i.test(cause.message))
            return 'Could not reach the embedding API';

        if (cause.message.startsWith('Embedding request failed'))
            return cause.message;

        if (cause.message)
            return cause.message;
    }

    return 'IMG search failed';
}

export function formatSearchFailureMessage(cause: unknown): string {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return detail ? `Malformed search string: ${detail}` : 'Malformed search string';
}

export function logSearchFailure(cause: unknown): void {
    if (cause instanceof Error) {
        console.error(`Search failed: ${cause.message}`, cause);
        return;
    }
    console.error('Search failed:', cause);
}

function mergeImgMatchScores(
    existing: Map<string, number> | undefined,
    next: Map<string, number>,
): Map<string, number> {
    if (!existing) {
        return new Map(next);
    }

    const merged = new Map<string, number>();
    for (const [id, score] of next) {
        if (!existing.has(id))
            continue;
        merged.set(id, Math.min(existing.get(id)!, score));
    }
    return merged;
}

function removeImgMatchScores(
    existing: Map<string, number> | undefined,
    excludedIds: Set<string>,
): Map<string, number> | undefined {
    if (!existing)
        return undefined;

    const remaining = new Map(existing);
    for (const id of excludedIds) {
        remaining.delete(id);
    }
    return remaining;
}

function subtractIds(ids: Set<string>, excludedIds: Set<string>): Set<string> {
    const remaining = new Set<string>();
    for (const id of ids) {
        if (!excludedIds.has(id))
            remaining.add(id);
    }
    return remaining;
}

function parseImgQueryNumber(value: string): { threshold?: number; k?: number } | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    if (/^-?\d+$/.test(trimmed)) {
        const k = Number(trimmed);
        if (!Number.isFinite(k)) {
            return undefined;
        }
        return { k };
    }

    const threshold = parseSearchFloat(trimmed);
    if (threshold === undefined) {
        return undefined;
    }
    return { threshold };
}

function parseSearchTargetWithOptionalImgLimit(raw: string): {
    text: string;
    threshold?: number;
    k?: number;
} {
    const trimmed = raw.trim();
    if (!trimmed) {
        return { text: '' };
    }

    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace <= 0) {
        return { text: trimmed };
    }

    const suffix = parseImgQueryNumber(trimmed.slice(lastSpace + 1));
    if (!suffix) {
        return { text: trimmed };
    }

    return {
        text: trimmed.slice(0, lastSpace).trim(),
        ...suffix,
    };
}

function parseSearchTargetWithOptionalThreshold(raw: string): { text: string; threshold?: number } {
    const trimmed = raw.trim();
    if (!trimmed) {
        return { text: '' };
    }

    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace <= 0) {
        return { text: trimmed };
    }

    const threshold = parseSearchFloat(trimmed.slice(lastSpace + 1));
    if (threshold === undefined) {
        return { text: trimmed };
    }

    return {
        text: trimmed.slice(0, lastSpace).trim(),
        threshold,
    };
}

function isImgSearchPart(part: string): boolean {
    return imgRegex.test(part) || imgOnlyRegex.test(part);
}

function isStructuralSearchPart(part: string): boolean {
    return skipRegex.test(part) || takeRegex.test(part);
}

function buildNonImgSearchQuery(search: string): string {
    return splitSearchParts(search)
        .filter((part) => !isImgSearchPart(part) && !isStructuralSearchPart(part))
        .join(' AND ');
}

function isTextImgSearchPart(part: string): boolean {
    const parsed = parseImgSearchPart(part);
    return !parsed.presenceOnly && Boolean(parsed.queryText);
}

function hasTextImgSearch(search: string): boolean {
    return splitSearchParts(search).some((part) => isImgSearchPart(part) && isTextImgSearchPart(part));
}

function hasPositiveImgTextSearch(search: string): boolean {
    return splitSearchParts(search).some((part) => {
        if (!isImgSearchPart(part) || notRegex.test(part))
            return false;
        return isTextImgSearchPart(part);
    });
}

function getResultWindow(search: string): { skip: number; take: number } {
    return {
        skip: getResultSkipCount(search),
        take: getResultTakeCount(search),
    };
}

type SearchAbortOptions = {
    isAborted?: () => boolean;
    signal?: AbortSignal;
};

function throwIfSearchAborted(options: SearchAbortOptions): void {
    if (options.isAborted?.() || options.signal?.aborted)
        throw new SearchStreamAborted();
}

async function maybeYieldAndThrowIfAborted(
    index: number,
    options: SearchAbortOptions,
): Promise<void> {
    if (index % 500 !== 0)
        return;
    await yieldToEventLoop();
    throwIfSearchAborted(options);
}

async function buildEmbeddingSearchCandidates(
    baseCandidateIds: Set<string>,
    priorImgMatchIds?: Set<string>,
    options: SearchAbortOptions = {},
): Promise<Set<string>> {
    throwIfSearchAborted(options);
    const embeddedIds = EmbeddingDB.getAllImageIds();
    const candidates = new Set<string>();
    let index = 0;
    for (const id of baseCandidateIds) {
        await maybeYieldAndThrowIfAborted(++index, options);
        if (embeddedIds.has(id))
            candidates.add(id);
    }

    if (!priorImgMatchIds)
        return candidates;

    const narrowed = new Set<string>();
    index = 0;
    for (const id of candidates) {
        await maybeYieldAndThrowIfAborted(++index, options);
        if (priorImgMatchIds.has(id))
            narrowed.add(id);
    }
    return narrowed;
}

export type ImgSearchResolveOptions = {
    baseCandidateIds?: Set<string>;
} & SearchAbortOptions;

function parseImgSearchPart(part: string): {
    presenceOnly: boolean;
    queryText: string;
    threshold?: number;
    k?: number;
    disableTemplate?: boolean;
} {
    if (imgOnlyRegex.test(part)) {
        return { presenceOnly: true, queryText: '' };
    }

    let raw = part.replace(removeRegex, '');
    let disableTemplate = false;

    if (/^~\s*/.test(raw)) {
        disableTemplate = true;
        raw = raw.replace(/^~\s*/, '');
    }

    const { text: queryText, threshold, k } = parseSearchTargetWithOptionalImgLimit(raw);
    if (!queryText) {
        return { presenceOnly: true, queryText: '', disableTemplate };
    }

    return { presenceOnly: false, queryText, threshold, k, disableTemplate };
}

export async function resolveImgSearchContext(
    query: string,
    options: ImgSearchResolveOptions,
): Promise<ImgSearchContext | undefined> {
    const parts = splitSearchParts(query);
    const context: ImgSearchContext = { parts: new Map() };
    let hasImgParts = false;
    let combinedMatchScores: Map<string, number> | undefined;
    let refinedCandidateIds: Set<string> | undefined;
    let error: string | undefined;

    for (let index = 0; index < parts.length; index++) {
        throwIfSearchAborted(options);
        const part = parts[index];
        if (!isImgSearchPart(part))
            continue;

        hasImgParts = true;

        const isNegatedImgPart = Boolean(part.match(notRegex));
        const { presenceOnly, queryText, threshold, k, disableTemplate } = parseImgSearchPart(part);
        if (presenceOnly) {
            context.parts.set(index, { presence: true });
            continue;
        }

        if (!isServerEmbeddingConfigured()) {
            context.parts.set(index, { presence: false, invalid: true });
            error ??= IMG_SEARCH_UNCONFIGURED_MESSAGE;
            continue;
        }

        try {
            const currentCandidateIds = refinedCandidateIds
                ?? options.baseCandidateIds
                ?? EmbeddingDB.getAllImageIds();
            const candidateIds = await buildEmbeddingSearchCandidates(
                currentCandidateIds,
                undefined,
                options,
            );
            if (!candidateIds.size) {
                context.parts.set(index, {
                    presence: false,
                    matchIds: new Set(),
                });
                refinedCandidateIds = candidateIds;
                if (!isNegatedImgPart)
                    combinedMatchScores = mergeImgMatchScores(combinedMatchScores, new Map());
                continue;
            }

            const settings = getServerEmbeddingSettings();
            const embedText = formatEmbeddingSearchQuery(
                queryText,
                disableTemplate ? '' : settings.searchTemplate,
            );
            throwIfSearchAborted(options);
            const queryEmbedding = await embedQuery(settings, embedText, { signal: options.signal });
            throwIfSearchAborted(options);
            const effectiveThreshold = threshold ?? IMAGE_EMBEDDING_SIMILARITY_THRESHOLD;
            const matchScores = EmbeddingDB.findSimilarImage(
                queryEmbedding,
                effectiveThreshold,
                k,
                candidateIds,
                settings.useOptimizedEmbeddingQuery,
            );
            throwIfSearchAborted(options);
            const matchIds = new Set(matchScores.keys());
            refinedCandidateIds = isNegatedImgPart
                ? subtractIds(candidateIds, matchIds)
                : matchIds;
            if (!isNegatedImgPart)
                combinedMatchScores = mergeImgMatchScores(combinedMatchScores, matchScores);
            else
                combinedMatchScores = removeImgMatchScores(combinedMatchScores, matchIds);
            context.parts.set(index, {
                presence: false,
                matchIds,
            });
        } catch (cause) {
            if (options.isAborted?.() || options.signal?.aborted)
                throw new SearchStreamAborted();
            if (cause instanceof Error && cause.name === 'AbortError')
                throw new SearchStreamAborted();
            console.error(formatImgSearchFailure(cause));
            context.parts.set(index, { presence: false, invalid: true });
            error ??= formatImgSearchFailure(cause);
        }
    }

    if (combinedMatchScores?.size)
        context.matchScores = combinedMatchScores;

    if (error)
        context.error = error;

    return hasImgParts ? context : undefined;
}

function parseSimilarSearchTarget(raw: string): { imageId: string; threshold?: number } {
    const { text, threshold } = parseSearchTargetWithOptionalThreshold(raw);
    return { imageId: text, threshold };
}

function parseIdSearchTarget(raw: string): string[] {
    return raw.split(/[,\|]\s*/).map((id) => id.trim()).filter(Boolean);
}

export type SearchOptions = {
    timestamp?: number;
    sorting?: SortingMethod;
    skipResults?: boolean;
    takeResults?: boolean;
};

type SearchPlanBase = {
    search: string;
    matching: SearchMode;
    exploration: ExplorationSettings;
    sorting: SortingMethod;
    imageList: Map<string, ServerImage>;
    images: ServerImage[];
    pool: Set<string>;
    matcher: (image: ServerImage) => boolean;
    imgSearchContext?: ImgSearchContext;
};

export type SearchPlan = SearchPlanBase & (
    | {
        kind: 'stream-scan';
        orderedIds: string[];
    }
    | {
        kind: 'img-ranked';
        orderedIds: string[];
        imgSearchContext: ImgSearchContext;
    }
);

async function buildBaseCandidateIds(
    search: string,
    matching: SearchMode,
    exploration: ExplorationSettings,
    imageList: Map<string, ServerImage>,
    pool: Set<string>,
    options: SearchAbortOptions = {},
): Promise<Set<string>> {
    const nonImgQuery = buildNonImgSearchQuery(search);
    if (!nonImgQuery.trim())
        return new Set(pool);

    const matcher = buildMatcher(nonImgQuery, matching, exploration);
    const candidateIds = new Set<string>();
    let index = 0;
    for (const id of pool) {
        await maybeYieldAndThrowIfAborted(++index, options);
        const image = imageList.get(id);
        if (image && matcher(image))
            candidateIds.add(id);
    }
    return candidateIds;
}

function orderIdsByMatchScores(scores: Map<string, number>): string[] {
    return [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
}

export async function buildSearchPlan(
    search: string,
    matching: SearchMode,
    exploration: ExplorationSettings,
    sorting: SortingMethod,
    imgSearchContext?: ImgSearchContext,
    options: SearchAbortOptions = {},
): Promise<SearchPlan> {
    if (matching === 'regex' && search && !validRegex(search))
        throw new Error('Invalid regex');

    throwIfSearchAborted(options);
    const imageList = getImageList();
    const images = [...imageList.values()];
    const pool = getExplorationPool(exploration, images);
    throwIfSearchAborted(options);

    if (hasPositiveImgTextSearch(search)) {
        const baseCandidateIds = await buildBaseCandidateIds(
            search,
            matching,
            exploration,
            imageList,
            pool,
            options,
        );
        throwIfSearchAborted(options);
        const resolvedImgSearchContext = imgSearchContext
            ?? await resolveImgSearchContext(search, { baseCandidateIds, ...options });
        throwIfSearchAborted(options);
        const matcher = buildMatcher(search, matching, exploration, resolvedImgSearchContext);
        return {
            kind: 'img-ranked',
            search,
            matching,
            exploration,
            sorting,
            imageList,
            images,
            pool,
            matcher,
            imgSearchContext: resolvedImgSearchContext ?? { parts: new Map() },
            orderedIds: resolvedImgSearchContext?.matchScores
                ? orderIdsByMatchScores(resolvedImgSearchContext.matchScores)
                : [],
        };
    }

    const baseCandidateIds = hasTextImgSearch(search)
        ? await buildBaseCandidateIds(
            search,
            matching,
            exploration,
            imageList,
            pool,
            options,
        )
        : pool;
    throwIfSearchAborted(options);
    const resolvedImgSearchContext = imgSearchContext
        ?? await resolveImgSearchContext(search, { baseCandidateIds, ...options });
    const matcher = buildMatcher(search, matching, exploration, resolvedImgSearchContext);
    return {
        kind: 'stream-scan',
        search,
        matching,
        exploration,
        sorting,
        imageList,
        images,
        pool,
        matcher,
        imgSearchContext: resolvedImgSearchContext,
        orderedIds: orderPoolIds(pool, sorting),
    };
}

export function collectSearchPlanImages(
    plan: SearchPlan,
    options: SearchOptions = {},
): ServerImage[] {
    if (plan.matching === 'regex' && plan.search && !validRegex(plan.search))
        throw new Error('Invalid regex');

    const freshIds = options.timestamp
        ? new Set(getFreshImages(options.timestamp).map((image) => image.id))
        : undefined;
    let list: ServerImage[] = [];

    for (const id of plan.orderedIds) {
        if (freshIds && !freshIds.has(id))
            continue;
        const image = plan.imageList.get(id);
        if (image && plan.matcher(image))
            list.push(image);
    }

    if (plan.kind === 'stream-scan' && plan.sorting === 'date') {
        list = applyLatestImageException(
            list,
            plan.images,
            plan.pool,
            plan.matcher,
            options.timestamp,
        );
    }

    if (options.skipResults !== false || options.takeResults !== false) {
        const skipped = options.skipResults !== false
            ? applyResultSkip(list, plan.search)
            : list;
        return options.takeResults !== false
            ? applyResultTake(skipped, plan.search)
            : skipped;
    }

    return list;
}

export type SearchImagesResult = {
    images: ServerImage[];
    imgSearchError?: string;
    imgSearchContext?: ImgSearchContext;
};

export async function searchImagesAsync(
    search: string,
    matching: SearchMode,
    exploration: ExplorationSettings,
    options: SearchOptions = {},
): Promise<SearchImagesResult> {
    const plan = await buildSearchPlan(search, matching, exploration, options.sorting ?? 'date');
    return {
        images: collectSearchPlanImages(plan, options),
        imgSearchError: plan.imgSearchContext?.error,
        imgSearchContext: plan.imgSearchContext,
    };
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
    signal?: AbortSignal;
};

export class SearchStreamAborted extends Error {
    constructor() {
        super('Search stream aborted');
        this.name = 'SearchStreamAborted';
    }
}

export type SearchStreamResult = {
    orderedIds: string[];
    amount: number;
    imgSearchContext?: ImgSearchContext;
};

export async function searchImagesStreaming(
    search: string,
    matching: SearchMode,
    exploration: ExplorationSettings,
    sorting: SortingMethod,
    onChunk: (images: ServerImage[], matched: number) => void,
    options: SearchStreamOptions = {},
    imgSearchContext?: ImgSearchContext,
): Promise<SearchStreamResult> {
    if (matching === 'regex' && search && !validRegex(search))
        throw new Error('Invalid regex');

    const yieldEvery = options.yieldEvery ?? 50;
    const chunkIntervalMs = options.chunkIntervalMs ?? 100;
    const firstChunkMaxImages = options.firstChunkMaxImages ?? 1000;
    const firstChunkMinMs = options.firstChunkMinMs ?? 100;
    const maxChunkImages = options.maxChunkImages ?? 500;
    await yieldToEventLoop();
    throwIfSearchAborted(options);

    const plan = await buildSearchPlan(search, matching, exploration, sorting, imgSearchContext, options);
    await yieldToEventLoop();
    throwIfSearchAborted(options);

    const { skip: skipThreshold, take: takeLimit } = getResultWindow(search);

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

    for (const id of plan.orderedIds) {
        if (++scanned % yieldEvery === 0) {
            await yieldToEventLoop();
            if (options.isAborted?.()) break;
            await maybeEmitByTime();
        }

        const value = plan.imageList.get(id);
        if (!value || !plan.matcher(value)) continue;

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
        .map((id) => plan.imageList.get(id))
        .filter((image): image is ServerImage => !!image);

    if (plan.kind === 'stream-scan' && sorting === 'date') {
        if (options.isAborted?.()) {
            return { orderedIds: [], amount: 0 };
        }

        const withException = applyLatestImageException(
            finalImages,
            plan.images,
            plan.pool,
            plan.matcher,
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
        imgSearchContext: plan.imgSearchContext,
    };
}

function orderPoolIds(pool: Set<string>, sorting: SortingMethod): string[] {
    const imageList = getImageList();
    const ids = [...pool];

    if (sorting === 'random')
        return shuffle(ids);

    const poolImages = ids
        .map((id) => imageList.get(id))
        .filter((image): image is ServerImage => !!image);

    return sortImages(poolImages, sorting).map((image) => image.id);
}

function applyLatestImageException(
    list: ServerImage[],
    images: ServerImage[],
    pool: Set<string>,
    matcher: (image: ServerImage) => boolean,
    timestamp?: number,
): ServerImage[] {
    const newest = getNewestLibraryImage(images);
    if (!newest || pool.has(newest.id) || !matcher(newest))
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
    imgSearchContext?: ImgSearchContext,
): (image: ServerImage) => boolean {
    const similaritySettings = exploration ?? defaultExplorationSettings;
    const searchParts = splitSearchParts(search);
    const regexes = searchParts.map((x, partIndex) => {
        const raw = x.replace(removeRegex, '');
        const take = takeRegex.test(x);

        if (take) {
            return undefined;
        }

        if (skipRegex.test(x)) {
            return undefined;
        }

        let type: MatchType = 'positive';
        if (allRegex.test(x)) type = 'all';
        else if (negativeRegex.test(x)) type = 'negative';
        else if (folderRegex.test(x)) type = 'folder';
        else if (paramRegex.test(x)) type = 'params';
        else if (dateRegex.test(x)) type = 'date';
        else if (modelRegex.test(x)) type = 'model';
        else if (annotationRegex.test(x)) type = 'annotation';
        else if (tagRegex.test(x)) type = 'tag';
        else if (similarRegex.test(x)) type = 'similar';
        else if (idRegex.test(x)) type = 'id';
        else if (videoRegex.test(x) || videoOnlyRegex.test(x)) type = 'video';
        else if (imgRegex.test(x) || imgOnlyRegex.test(x)) type = 'img';

        let similarRef: string | undefined;
        let similarThreshold: number | undefined;
        let similarInvalid = false;
        if (type === 'similar') {
            const { imageId, threshold } = parseSimilarSearchTarget(raw);
            similarThreshold = threshold;
            const refImage = getImageList().get(imageId);
            if (!refImage) {
                similarInvalid = true;
            } else {
                similarRef = similarityPromptText(refImage);
            }
        }

        let idTargets: Set<string> | undefined;
        let idInvalid = false;
        if (type === 'id') {
            const imageIds = parseIdSearchTarget(raw);
            const imageList = getImageList();
            if (imageIds.length === 0 || imageIds.some((id) => !imageList.has(id))) {
                idInvalid = true;
            } else {
                idTargets = new Set(imageIds);
            }
        }

        let imgPresence = false;
        let imgMatchIds: Set<string> | undefined;
        let imgInvalid = false;

        const imgPart = imgSearchContext?.parts.get(partIndex);
        if (type === 'img') {
            const { presenceOnly, queryText } = parseImgSearchPart(x);
            if (imgPart?.invalid) {
                imgInvalid = true;
            } else if (presenceOnly || imgPart?.presence) {
                imgPresence = true;
            } else if (imgPart?.matchIds) {
                imgMatchIds = imgPart.matchIds;
            } else if (queryText && !imgSearchContext) {
                imgInvalid = true;
            }
        }

        const searchRaw = type === 'tag' ? raw.trim() : raw;
        const tagExact = type === 'tag' ? isExactTagTerm(searchRaw) : undefined;
        const part: SearchPart = {
            raw: searchRaw,
            regex: type === 'tag' && tagExact ? /(?:)/ : new RegExp(searchRaw, 'is'),
            not: x.match(notRegex),
            type,
            tagExact,
            similarRef,
            similarThreshold,
            similarInvalid,
            imgPresence,
            imgMatchIds,
            imgInvalid,
            idTargets,
            idInvalid,
        };

        return part;
    }).filter((x): x is SearchPart => x !== undefined)
        .sort((a, b) => getSearchPartRank(a) - getSearchPartRank(b));

    if (regexes.some(x => x.similarInvalid || x.imgInvalid || x.idInvalid))
        return () => false;

    const embeddedImageIds = regexes.some(x => x.imgPresence)
        ? EmbeddingDB.getAllImageIds()
        : undefined;

    return (image: ServerImage) => {
        return regexes.every(x => {
            if (x.type === 'similar') {
                const similarity = computeSimilarity(
                    x.similarRef!,
                    similarityPromptText(image),
                    similaritySettings.similarityAlgorithm,
                );
                const threshold = x.similarThreshold ?? similaritySettings.similarityThreshold;
                const matched = similarity >= threshold;
                return XOR(x.not, matched);
            }

            if (x.type === 'img') {
                const matched = x.imgPresence
                    ? (embeddedImageIds?.has(image.id) ?? false)
                    : (x.imgMatchIds?.has(image.id) ?? false);
                return XOR(x.not, matched);
            }

            if (x.type === 'id') {
                const matched = x.idTargets!.has(image.id);
                return XOR(x.not, matched);
            }

            if (x.type === 'video') {
                const matched = isVideo(image.file);
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

            if (x.type === 'tag') {
                const matched = tagMatches(image.tags ?? [], x);
                return XOR(x.not, matched);
            }

            const text = getTextByType(image, x.type);
            const matched = textMatches(text, x, matching);

            return XOR(x.not, matched);
        });
    };
}

export function applyResultSkip(
    images: ServerImage[],
    search: string,
): ServerImage[] {
    const skipCount = getResultSkipCount(search);
    if (!skipCount) return images;
    return images.slice(skipCount);
}

export function applyResultTake(
    images: ServerImage[],
    search: string,
): ServerImage[] {
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
    if (part.type === 'id') return 0;
    if (part.type === 'date') return 1;
    if (part.type === 'folder' || part.type === 'tag' || part.type === 'video') return 2;
    if (part.type === 'model') return 3;
    if (part.type === 'positive' || part.type === 'negative' || part.type === 'annotation') return 4;
    if (part.type === 'params') return 5;
    if (part.type === 'similar') return 6;
    if (part.type === 'img') return 7;
    if (part.type === 'all') return 8;
    return 4;
}

function tagMatches(tags: string[], part: SearchPart): boolean {
    if (part.tagExact)
        return tags.some((tag) => tag === part.raw);
    const regex = new RegExp(part.raw, 'is');
    return tags.some((tag) => regex.test(tag));
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
        case 'tag':
            return (image.tags ?? []).join('\n');
        case 'similar':
            return '';
        case 'img':
            return '';
        case 'id':
            return image.id;
        case 'video':
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
            return shuffle(images);
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
