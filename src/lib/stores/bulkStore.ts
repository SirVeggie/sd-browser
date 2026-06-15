import { CUSTOM_INSTRUCTION_ID } from "$lib/stores/llmStore";
import { writable } from "svelte/store";

export type BulkActionType = "move" | "copy" | "delete" | "annotate";

export type BulkAnnotateMode = "generate" | "clear" | "modify";

export type BulkModalSettings = {
    action: BulkActionType;
    folder: string;
    annotateMode: BulkAnnotateMode;
    includeImage: boolean;
    includePrompt: boolean;
    systemInstructionPresetId: string;
    systemInstruction: string;
    responsePrefix: string;
    disableThinking: boolean;
    resultRegex: string;
    resultTemplate: string;
    appendResult: boolean;
};

export const bulkModalDefaults: BulkModalSettings = {
    action: "move",
    folder: "/",
    annotateMode: "generate",
    includeImage: false,
    includePrompt: true,
    systemInstructionPresetId: CUSTOM_INSTRUCTION_ID,
    systemInstruction: "",
    responsePrefix: "",
    disableThinking: false,
    resultRegex: "",
    resultTemplate: "",
    appendResult: false,
};

export const bulkModalStore = writable<BulkModalSettings>({ ...bulkModalDefaults });

export function syncBulkModalWithLocalStorage() {
    const name = "bulkModalSettings";
    if (localStorage.getItem(name)) {
        const value = JSON.parse(localStorage.getItem(name) || "");
        const annotateMode: BulkAnnotateMode = value.annotateMode
            ?? (value.clearAnnotation ? "clear" : "generate");
        bulkModalStore.set({
            ...bulkModalDefaults,
            ...value,
            annotateMode,
            systemInstructionPresetId:
                value.systemInstructionPresetId ?? CUSTOM_INSTRUCTION_ID,
        });
    }

    bulkModalStore.subscribe((x) => {
        localStorage.setItem(name, JSON.stringify(x));
    });
}
