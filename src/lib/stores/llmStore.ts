import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export type LlmSettings = {
    baseUrl: string;
    apiKey: string;
    modelId: string;
    parallelCalls: number;
};

export const llmStoreDefaults: LlmSettings = {
    baseUrl: "http://localhost:8000/v1",
    apiKey: "",
    modelId: "",
    parallelCalls: 4,
};

export const llmStore = writable<LlmSettings>({ ...llmStoreDefaults });

export function syncLlmWithLocalStorage() {
    syncMemory("llmSettings", llmStore);
}
