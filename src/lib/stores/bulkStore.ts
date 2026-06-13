import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export type BulkActionType = "move" | "copy" | "delete" | "annotate";

export type BulkModalSettings = {
    action: BulkActionType;
    folder: string;
    clearAnnotation: boolean;
    includeImage: boolean;
    includePrompt: boolean;
    systemInstruction: string;
    responsePrefix: string;
    disableThinking: boolean;
    resultRegex: string;
    appendResult: boolean;
};

export const bulkModalDefaults: BulkModalSettings = {
    action: "move",
    folder: "/",
    clearAnnotation: false,
    includeImage: false,
    includePrompt: true,
    systemInstruction: "",
    responsePrefix: "",
    disableThinking: false,
    resultRegex: "",
    appendResult: false,
};

export const bulkModalStore = writable<BulkModalSettings>({ ...bulkModalDefaults });

export function syncBulkModalWithLocalStorage() {
    syncMemory("bulkModalSettings", bulkModalStore);
}
