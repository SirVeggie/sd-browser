import { syncMemory } from "$lib/tools/syncStorage";
import type { FlyoutMode } from "$lib/types";
import { writable } from "svelte/store";

export type FlyoutStore = {
    enabled: boolean;
    url: string;
    mode: FlyoutMode;
};
export const flyoutStore = writable<FlyoutStore>({
    enabled: false,
    url: 'http://localhost:7860/',
    mode: 'normal',
});

export const flyoutState = writable(false);

export function syncFlyoutWithLocalStorage() {
    syncMemory('flyout', flyoutStore);
    syncMemory('flyoutState', flyoutState);
}