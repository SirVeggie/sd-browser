import type { EmbeddingApiType, EmbeddingSettings } from "$lib/types/embeddings";
import type { BulkEmbeddingConfig } from "$lib/types/requests";
import { encodeImageForEmbedding } from "./convert";
import { EmbeddingDB } from "./embeddingDb";
import { getImage } from "./dataIndex";
import { MiscDB } from "./db";
import {
    embeddingStoreDefaults,
    isEmbeddingApiType,
    isEmbeddingConfigured,
    normalizeEmbeddingSettings,
} from "$lib/types/embeddings";
import { getEmbeddingImagePath } from "$lib/tools/misc";
import { logSearchTiming, startSearchTiming } from "./searchTiming";

const EMBEDDING_REQUEST_TIMEOUT_MS = 120_000;
const PROPS_REQUEST_TIMEOUT_MS = 15_000;
const EMBEDDING_ERROR_TEXT_MAX_LENGTH = 500;
const settingsKey = "settings";

function sanitizeEmbeddingErrorText(text: string): string {
    const withoutBase64 = text.replace(/[A-Za-z0-9+/]{200,}={0,2}/g, "[…omitted…]");
    if (withoutBase64.length <= EMBEDDING_ERROR_TEXT_MAX_LENGTH) {
        return withoutBase64;
    }
    return `${withoutBase64.slice(0, EMBEDDING_ERROR_TEXT_MAX_LENGTH)}…`;
}

export type EmbeddingApiConfig = {
    apiType: EmbeddingApiType;
    baseUrl: string;
    apiKey?: string;
    modelId: string;
};

type EmbeddingRequestConfig = EmbeddingApiConfig | BulkEmbeddingConfig | EmbeddingSettings;

function trimBaseUrl(raw: string): string {
    return raw.trim().replace(/\/+$/, "");
}

function toApiConfig(config: EmbeddingRequestConfig): EmbeddingApiConfig {
    const apiType = isEmbeddingApiType(config.apiType) ? config.apiType : embeddingStoreDefaults.apiType;
    return {
        apiType,
        baseUrl: trimBaseUrl(config.baseUrl),
        apiKey: config.apiKey || undefined,
        modelId: config.modelId,
    };
}

function embeddingHeaders(config: EmbeddingApiConfig): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
    }
    return headers;
}

function resolveLlamaEmbeddingUrl(config: EmbeddingApiConfig): string {
    const base = trimBaseUrl(config.baseUrl);
    return `${base}/embedding`;
}

function resolveSvEmbedUrl(config: EmbeddingApiConfig): string {
    const base = trimBaseUrl(config.baseUrl);
    return `${base}/embed`;
}

function resolvePropsUrl(config: EmbeddingApiConfig): string {
    const base = trimBaseUrl(config.baseUrl);
    const url = new URL(`${base}/props`);
    const model = config.modelId?.trim();
    if (model) {
        url.searchParams.set("model", model);
    }
    return url.toString();
}

export async function fetchLlamaMediaMarker(config: EmbeddingApiConfig): Promise<string | undefined> {
    const propsUrl = resolvePropsUrl(config);

    let response: Response;
    try {
        response = await fetch(propsUrl, {
            method: "GET",
            headers: embeddingHeaders(config),
            signal: AbortSignal.timeout(PROPS_REQUEST_TIMEOUT_MS),
        });
    } catch {
        return undefined;
    }

    if (!response.ok) {
        return undefined;
    }

    try {
        const data = await response.json() as { media_marker?: unknown };
        const marker = typeof data.media_marker === "string" ? data.media_marker.trim() : "";
        return marker || undefined;
    } catch {
        return undefined;
    }
}

function l2Normalize(vector: Float32Array): Float32Array {
    let sumSq = 0;
    for (const value of vector) {
        sumSq += value * value;
    }
    const norm = Math.sqrt(sumSq);
    if (!norm) {
        return vector;
    }
    for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
    }
    return vector;
}

function lastTokenEmbedding(tokenEmbeddings: number[][]): Float32Array {
    const last = tokenEmbeddings[tokenEmbeddings.length - 1];
    if (!last?.length) {
        throw new Error("Embedding API returned no token vectors");
    }

    return l2Normalize(Float32Array.from(last));
}

function parseLlamaEmbeddingItem(item: unknown): Float32Array {
    const payload = item as { index?: number; embedding?: number[] | number[][] };
    const embedding = payload?.embedding;
    if (!embedding?.length) {
        throw new Error("Embedding API returned no vector");
    }

    if (Array.isArray(embedding[0])) {
        return lastTokenEmbedding(embedding as number[][]);
    }

    return Float32Array.from(embedding as number[]);
}

function parseLlamaEmbeddingResponse(data: unknown): Float32Array {
    const payload = data as
        | { index?: number; embedding?: number[] | number[][] }[]
        | { index?: number; embedding?: number[] | number[][] };

    const item = Array.isArray(payload) ? payload[0] : payload;
    return parseLlamaEmbeddingItem(item);
}

function parseLlamaBatchEmbeddingResponse(data: unknown, expectedCount: number): Float32Array[] {
    if (Array.isArray(data)) {
        if (data.length !== expectedCount) {
            throw new Error(`Embedding API returned ${data.length} vectors, expected ${expectedCount}`);
        }
        return data.map((item) => parseLlamaEmbeddingItem(item));
    }
    if (expectedCount === 1) {
        return [parseLlamaEmbeddingResponse(data)];
    }
    throw new Error(`Embedding API returned 1 vector, expected ${expectedCount}`);
}

type SvEmbedInput =
    | { type: "text"; text: string }
    | { type: "image_base64"; image_base64: string };

function parseSvEmbedResponse(data: unknown): Float32Array {
    return parseSvEmbedBatchResponse(data, 1)[0];
}

type SvEmbedRow = {
    index?: number;
    type?: string;
    embedding?: number[];
};

function parseSvEmbedRow(item: unknown): Float32Array {
    if (Array.isArray(item)) {
        if (!item.length) {
            throw new Error("Embedding API returned no vector");
        }
        return Float32Array.from(item);
    }

    const row = item as SvEmbedRow;
    if (!row.embedding?.length) {
        throw new Error("Embedding API returned no vector");
    }
    return Float32Array.from(row.embedding);
}

function parseSvEmbedBatchResponse(data: unknown, expectedCount: number): Float32Array[] {
    const payload = data as { embeddings?: unknown[]; embedding?: number[] };

    if (payload.embeddings?.length) {
        if (payload.embeddings.length !== expectedCount) {
            throw new Error(`Embedding API returned ${payload.embeddings.length} vectors, expected ${expectedCount}`);
        }
        return payload.embeddings.map(parseSvEmbedRow);
    }
    if (payload.embedding?.length) {
        if (expectedCount !== 1) {
            throw new Error(`Embedding API returned 1 vector, expected ${expectedCount}`);
        }
        return [Float32Array.from(payload.embedding)];
    }
    if (Array.isArray(data)) {
        if (data.length !== expectedCount) {
            throw new Error(`Embedding API returned ${data.length} vectors, expected ${expectedCount}`);
        }
        return data.map(parseSvEmbedRow);
    }

    throw new Error("Embedding API returned no vectors");
}

function buildLlamaEmbeddingRequestBody(
    config: EmbeddingApiConfig,
    content: Record<string, unknown>[],
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        content,
        embd_normalize: 2,
    };
    const model = config.modelId?.trim();
    if (model) {
        body.model = model;
    }
    return body;
}

function buildSvEmbedRequestBody(inputs: SvEmbedInput[]): Record<string, unknown> {
    return {
        inputs,
        normalize: true,
    };
}

async function postEmbeddingRequest<T>(
    config: EmbeddingApiConfig,
    url: string,
    body: Record<string, unknown>,
    parseResponse: (data: unknown) => T,
    options: { signal?: AbortSignal } = {},
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: embeddingHeaders(config),
            body: JSON.stringify(body),
            signal: options.signal
                ? AbortSignal.any([AbortSignal.timeout(EMBEDDING_REQUEST_TIMEOUT_MS), options.signal])
                : AbortSignal.timeout(EMBEDDING_REQUEST_TIMEOUT_MS),
        });
    } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") {
            throw cause;
        }
        if (cause instanceof Error && cause.name === "TimeoutError") {
            throw new Error(`Embedding request timed out after ${EMBEDDING_REQUEST_TIMEOUT_MS / 1000}s`);
        }
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`Embedding request failed: ${sanitizeEmbeddingErrorText(message)}`);
    }

    if (!response.ok) {
        const errText = await response.text().catch(() => "");
        const sanitized = sanitizeEmbeddingErrorText(errText || response.statusText);
        console.error(`Embedding API error (${response.status}): ${sanitized}`);
        throw new Error(`Embedding request failed (${response.status}): ${sanitized}`);
    }

    const data = await response.json();
    return parseResponse(data);
}

async function requestLlamaQueryEmbedding(
    config: EmbeddingApiConfig,
    text: string,
    options: { signal?: AbortSignal } = {},
): Promise<Float32Array> {
    return postEmbeddingRequest(
        config,
        resolveLlamaEmbeddingUrl(config),
        buildLlamaEmbeddingRequestBody(config, [{ prompt_string: text }]),
        parseLlamaEmbeddingResponse,
        options,
    );
}

async function requestLlamaImageEmbeddingBatch(
    config: EmbeddingApiConfig,
    imageBase64s: string[],
    mediaMarker?: string,
): Promise<Float32Array[]> {
    if (imageBase64s.length === 0) {
        return [];
    }

    const marker = mediaMarker ?? await fetchLlamaMediaMarker(config);
    const content = imageBase64s.map((imageBase64) => {
        const contentItem: Record<string, unknown> = {
            multimodal_data: [imageBase64],
        };
        if (marker) {
            contentItem.prompt_string = marker;
        }
        return contentItem;
    });

    return postEmbeddingRequest(
        config,
        resolveLlamaEmbeddingUrl(config),
        buildLlamaEmbeddingRequestBody(config, content),
        (data) => parseLlamaBatchEmbeddingResponse(data, imageBase64s.length),
    );
}

async function requestLlamaImageEmbedding(
    config: EmbeddingApiConfig,
    imageBase64: string,
    mediaMarker?: string,
): Promise<Float32Array> {
    const [embedding] = await requestLlamaImageEmbeddingBatch(config, [imageBase64], mediaMarker);
    return embedding;
}

async function requestSvEmbedBatch(
    config: EmbeddingApiConfig,
    inputs: SvEmbedInput[],
    options: { signal?: AbortSignal } = {},
): Promise<Float32Array[]> {
    if (inputs.length === 0) {
        return [];
    }

    return postEmbeddingRequest(
        config,
        resolveSvEmbedUrl(config),
        buildSvEmbedRequestBody(inputs),
        (data) => parseSvEmbedBatchResponse(data, inputs.length),
        options,
    );
}

async function requestSvEmbed(
    config: EmbeddingApiConfig,
    inputs: SvEmbedInput[],
    options: { signal?: AbortSignal } = {},
): Promise<Float32Array> {
    const [embedding] = await requestSvEmbedBatch(config, inputs, options);
    return embedding;
}

export async function fetchMediaMarkerForConfig(config: EmbeddingRequestConfig): Promise<string | undefined> {
    const api = toApiConfig(config);
    if (api.apiType !== "llama-cpp") {
        return undefined;
    }
    return fetchLlamaMediaMarker(api);
}

/** Embed search query text for comparison against stored image embeddings. */
export async function embedQuery(
    config: EmbeddingRequestConfig,
    text: string,
    options: { signal?: AbortSignal } = {},
): Promise<Float32Array> {
    const startedAt = startSearchTiming();
    const api = toApiConfig(config);
    let embedding: Float32Array;
    switch (api.apiType) {
        case "llama-cpp":
            embedding = await requestLlamaQueryEmbedding(api, text, options);
            break;
        case "sv-embed":
            embedding = await requestSvEmbed(api, [{ type: "text", text }], options);
            break;
        default: {
            const _exhaustive: never = api.apiType;
            throw new Error(`Unknown embedding API type: ${_exhaustive}`);
        }
    }
    logSearchTiming('embedQuery', startedAt, {
        api: api.apiType,
        dims: embedding.length,
        chars: text.length,
    });
    return embedding;
}

async function embedImagePaths(
    config: EmbeddingRequestConfig,
    imagePaths: string[],
    mediaMarker?: string,
): Promise<Float32Array[]> {
    if (imagePaths.length === 0) {
        return [];
    }

    const api = toApiConfig(config);
    const buffers = await Promise.all(
        imagePaths.map((path) => encodeImageForEmbedding(path, api.apiType)),
    );
    const imageBase64s = buffers.map((buffer) => buffer.toString("base64"));

    switch (api.apiType) {
        case "llama-cpp":
            return requestLlamaImageEmbeddingBatch(api, imageBase64s, mediaMarker);
        case "sv-embed":
            return requestSvEmbedBatch(
                api,
                imageBase64s.map((image_base64) => ({ type: "image_base64", image_base64 })),
            );
        default: {
            const _exhaustive: never = api.apiType;
            throw new Error(`Unknown embedding API type: ${_exhaustive}`);
        }
    }
}

export type VectorizeBatchFailure = {
    id: string;
    message: string;
};

/** Vectorize up to apiBatch images in a single embedding API request. */
export async function vectorizeImageBatch(
    ids: string[],
    config: BulkEmbeddingConfig,
    options: { force?: boolean; mediaMarker?: string } = {},
): Promise<VectorizeBatchFailure[]> {
    const force = options.force ?? false;
    const toProcess: { id: string; path: string }[] = [];

    for (const id of ids) {
        const image = getImage(id);
        if (!image) {
            continue;
        }
        if (!force && EmbeddingDB.hasImageEmbedding(id)) {
            continue;
        }
        toProcess.push({ id, path: getEmbeddingImagePath(image) });
    }

    if (toProcess.length === 0) {
        return [];
    }

    try {
        const embeddings = await embedImagePaths(
            config,
            toProcess.map((item) => item.path),
            options.mediaMarker,
        );
        for (let i = 0; i < toProcess.length; i++) {
            EmbeddingDB.setImageEmbedding(toProcess[i].id, embeddings[i]);
        }
        return [];
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        console.error(`Vectorize batch failed (${toProcess.length} images): ${message}`);
        return toProcess.map((item) => ({ id: item.id, message }));
    }
}

export async function embedImage(
    config: EmbeddingRequestConfig,
    imagePath: string,
    mediaMarker?: string,
): Promise<Float32Array> {
    const [embedding] = await embedImagePaths(config, [imagePath], mediaMarker);
    return embedding;
}

export async function vectorizeImage(
    id: string,
    config: BulkEmbeddingConfig,
    options: { force?: boolean; mediaMarker?: string } = {},
): Promise<boolean> {
    const image = getImage(id);
    if (!image) return false;

    const force = options.force ?? false;
    if (!force && EmbeddingDB.hasImageEmbedding(id)) {
        return false;
    }

    const embedding = await embedImage(config, getEmbeddingImagePath(image), options.mediaMarker);
    EmbeddingDB.setImageEmbedding(id, embedding);
    return true;
}

export function getServerEmbeddingSettings(): EmbeddingSettings {
    const raw = MiscDB.get(settingsKey);
    if (!raw) return { ...embeddingStoreDefaults };

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const stored = parsed.embeddingSettings as Partial<EmbeddingSettings> | undefined;
        return normalizeEmbeddingSettings(stored);
    } catch {
        return { ...embeddingStoreDefaults };
    }
}

export function isServerEmbeddingConfigured(
    settings: EmbeddingSettings = getServerEmbeddingSettings(),
): boolean {
    return isEmbeddingConfigured(settings);
}
