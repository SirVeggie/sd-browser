import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export type FlyoutStore = {
    enabled: boolean;
    url: string;
};
export const flyoutStore = writable<FlyoutStore>({
    enabled: false,
    url: 'http://localhost:7860/',
});

export const flyoutState = writable(false);

export function syncFlyoutWithLocalStorage() {
    syncMemory('flyout', flyoutStore);
    syncMemory('flyoutState', flyoutState);
}