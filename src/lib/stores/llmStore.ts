import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export type SystemInstruction = {
    id: string;
    name: string;
    text: string;
};

export const CUSTOM_INSTRUCTION_ID = "custom";

export type LlmSettings = {
    baseUrl: string;
    apiKey: string;
    modelId: string;
    parallelCalls: number;
    systemInstructions: SystemInstruction[];
};

export const llmStoreDefaults: LlmSettings = {
    baseUrl: "http://localhost:8000/v1",
    apiKey: "",
    modelId: "",
    parallelCalls: 4,
    systemInstructions: [],
};

export const llmStore = writable<LlmSettings>({ ...llmStoreDefaults });

export function resolveSystemInstruction(
    presets: SystemInstruction[],
    presetId: string,
    customText: string,
): string {
    if (presetId === CUSTOM_INSTRUCTION_ID) return customText;
    return presets.find((preset) => preset.id === presetId)?.text ?? customText;
}

export function syncLlmWithLocalStorage() {
    syncMemory("llmSettings", llmStore, true);
}
