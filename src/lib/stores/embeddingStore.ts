import { pushGlobalSettings } from "$lib/requests/settingRequests";
import { addGlobalSetting } from "$lib/stores/globalSettings";
import {
    embeddingStoreDefaults,
    normalizeEmbeddingSettings,
    type EmbeddingSettings,
} from "$lib/types/embeddings";
import { writable } from "svelte/store";

export type { EmbeddingSettings } from "$lib/types/embeddings";
export { embeddingStoreDefaults, isEmbeddingConfigured } from "$lib/types/embeddings";

export const embeddingStore = writable<EmbeddingSettings>({ ...embeddingStoreDefaults });

export function syncEmbeddingWithLocalStorage() {
    const name = "embeddingSettings";
    addGlobalSetting(name, embeddingStore);

    if (localStorage.getItem(name)) {
        const value = JSON.parse(localStorage.getItem(name) || "") as Partial<EmbeddingSettings>;
        embeddingStore.set(normalizeEmbeddingSettings(value));
    }

    embeddingStore.subscribe((x) => {
        localStorage.setItem(name, JSON.stringify(x));
        pushGlobalSettings({
            settingsJson: JSON.stringify({ [name]: x }),
        });
    });
}
