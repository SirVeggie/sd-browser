export const embeddingApiTypes = ["llama-cpp", "sv-embed"] as const;
export type EmbeddingApiType = (typeof embeddingApiTypes)[number];

export function isEmbeddingApiType(value: unknown): value is EmbeddingApiType {
    return typeof value === "string" && embeddingApiTypes.includes(value as EmbeddingApiType);
}

export type EmbeddingSettings = {
    apiType: EmbeddingApiType;
    baseUrl: string;
    apiKey: string;
    modelId: string;
    apiBatch: number;
    /** When set, IMG search text is sent as template with `{label}` replaced by the query. */
    searchTemplate: string;
    /** Use sqlite-vec KNN for IMG searches when its result limit is sufficient. */
    useOptimizedEmbeddingQuery: boolean;
    /** Default similarity cutoff for IMG searches with a 64-char image id (image-to-image). */
    imageSimilarityThreshold: number;
};

export const embeddingStoreDefaults: EmbeddingSettings = {
    apiType: "llama-cpp",
    baseUrl: "http://localhost:8080",
    apiKey: "",
    modelId: "",
    apiBatch: 32,
    searchTemplate: "",
    useOptimizedEmbeddingQuery: true,
    imageSimilarityThreshold: 0.8,
};

export function formatEmbeddingSearchQuery(label: string, template: string): string {
    const trimmedLabel = label.trim();
    const trimmedTemplate = template.trim();
    if (!trimmedTemplate) {
        return trimmedLabel;
    }
    return trimmedTemplate.replaceAll("{label}", trimmedLabel);
}

type StoredEmbeddingSettings = Partial<EmbeddingSettings> & {
    /** @deprecated Renamed to apiBatch */
    parallelCalls?: number;
};

export function normalizeEmbeddingSettings(
    stored: StoredEmbeddingSettings | undefined,
): EmbeddingSettings {
    if (!stored) {
        return { ...embeddingStoreDefaults };
    }
    return {
        ...embeddingStoreDefaults,
        ...stored,
        apiBatch: stored.apiBatch ?? stored.parallelCalls ?? embeddingStoreDefaults.apiBatch,
        useOptimizedEmbeddingQuery:
            typeof stored.useOptimizedEmbeddingQuery === "boolean"
                ? stored.useOptimizedEmbeddingQuery
                : embeddingStoreDefaults.useOptimizedEmbeddingQuery,
        imageSimilarityThreshold:
            typeof stored.imageSimilarityThreshold === "number"
                ? stored.imageSimilarityThreshold
                : embeddingStoreDefaults.imageSimilarityThreshold,
    };
}

export const embeddingApiTypeOptions: { value: EmbeddingApiType; label: string }[] = [
    { value: "llama-cpp", label: "llama.cpp" },
    { value: "sv-embed", label: "sv-embed" },
];

type EmbeddingConfigCheck = Pick<EmbeddingSettings, "baseUrl" | "apiType" | "modelId">;

export function isEmbeddingConfigured(settings: EmbeddingConfigCheck): boolean {
    if (!settings.baseUrl.trim()) {
        return false;
    }
    if (settings.apiType === "llama-cpp") {
        return Boolean(settings.modelId.trim());
    }
    return true;
}
