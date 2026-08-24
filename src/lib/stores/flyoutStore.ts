import { syncMemory } from "$lib/tools/syncStorage";
import type { FlyoutMode } from "$lib/types/misc";
import { writable } from "svelte/store";

export type FlyoutStore = {
    enabled: boolean;
    url: string;
    mode: FlyoutMode;
    /** Absolute pixel width for custom mode. Window resize never writes this. */
    customWidth?: number;
};
export const flyoutStore = writable<FlyoutStore>({
    enabled: false,
    url: 'http://localhost:7860/',
    mode: 'normal',
});
export const flyoutHistory = writable<string[]>([]);
export const flyoutState = writable(false);
export const flyoutButton = writable(true);
export const flyoutButtonTop = writable(true);

/** Live drag width; not persisted. Null when the separator is not being dragged. */
export const flyoutCustomDragWidth = writable<number | null>(null);

export function syncFlyoutWithLocalStorage() {
    syncMemory('flyout', flyoutStore);
    syncMemory('flyoutState', flyoutState);
    syncMemory('flyoutButton', flyoutButton);
    syncMemory('flyoutButtonTop', flyoutButtonTop);
    syncMemory('flyoutHistory', flyoutHistory, true);
}
