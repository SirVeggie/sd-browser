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
};

export const embeddingStoreDefaults: EmbeddingSettings = {
    apiType: "llama-cpp",
    baseUrl: "http://localhost:8080",
    apiKey: "",
    modelId: "",
    apiBatch: 4,
};

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
