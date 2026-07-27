import { writable } from 'svelte/store';
import { syncMemory } from '$lib/tools/syncStorage';
import type { ObjectInfoMap, SvgenLayoutState, SvgenOpenSession, SvgenProgress, SvgenSession } from './types';
import { emptyLayout } from './layout';

export type FlyoutTab = 'webui' | 'generate';

export type SvgenUiStore = {
    /** Settings: show Generate tab in flyout */
    enabled: boolean;
};

export const svgenUiStore = writable<SvgenUiStore>({
    enabled: true,
});

/** Active flyout tab — localStorage only */
export const flyoutTabStore = writable<FlyoutTab>('webui');

export const svgenSessionStore = writable<SvgenSession | null>(null);
export const svgenLayoutStore = writable<SvgenLayoutState>(emptyLayout());
/** Open Generate sessions (multi-open). Live edits use session/layout/seed stores for the active id. */
export const svgenOpenSessionsStore = writable<{
    sessions: SvgenOpenSession[];
    activeId: string | null;
}>({ sessions: [], activeId: null });
export const svgenObjectInfoStore = writable<ObjectInfoMap | null>(null);
export const svgenProgressStore = writable<SvgenProgress | null>(null);
export const svgenStatusStore = writable<{
    available: boolean;
    publicUrl?: string;
    convert?: boolean;
    authRequired?: boolean;
    reason?: string;
} | null>(null);
export const svgenQueueOpenStore = writable(false);
export const svgenGeneratingStore = writable(false);
export const svgenErrorStore = writable<string | null>(null);

/** Ephemeral freeze keys (`nodeId:widgetName` / with inner id) — not persisted. */
export const svgenFrozenSeedsStore = writable<Set<string>>(new Set());
/** Last queued values for freeze restore — not persisted. */
export const svgenLastUsedSeedsStore = writable<Map<string, number>>(new Map());

/** Set image id to ask the Generate panel to open that workflow (consumed by Webui/SvGenPanel). */
export const svgenOpenImageRequest = writable<string | null>(null);

export function clearSvgenSeedControlState() {
    svgenFrozenSeedsStore.set(new Set());
    svgenLastUsedSeedsStore.set(new Map());
}

export function syncSvgenWithLocalStorage() {
    syncMemory('svgenUi', svgenUiStore);
    syncMemory('flyoutTab', flyoutTabStore);
}

export function requestOpenInPanel(imageId: string) {
    flyoutTabStore.set('generate');
    svgenOpenImageRequest.set(imageId);
}
