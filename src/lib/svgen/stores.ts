import { writable } from 'svelte/store';
import { syncMemory } from '$lib/tools/syncStorage';
import {
    buildComfyViewPathFromRef,
    invalidateAuthorizedBlobUrl,
} from './comfyImageUrls';
import {
    makeNodePreviewEntry,
    type ComfyOutputImageRef,
    type NodePreviewEntry,
} from './nodePreviews';
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

/** Freeze keys (`nodeId:widgetName` / with inner id) — kept per open session (localStorage bag). */
export const svgenFrozenSeedsStore = writable<Set<string>>(new Set());
/** Last queued values for freeze restore — kept per open session (localStorage bag). */
export const svgenLastUsedSeedsStore = writable<Map<string, number>>(new Map());
/**
 * Last `executed` output images per session+node (`sessionId\0nodeId`).
 * Ephemeral — not persisted; cleared when the session closes.
 */
export const svgenNodePreviewsStore = writable<Map<string, NodePreviewEntry>>(new Map());

export function nodePreviewStoreKey(sessionId: string, nodeId: string): string {
    return `${sessionId}\0${nodeId}`;
}

/** Set image id to ask the Generate panel to open that workflow (consumed by Webui/SvGenPanel). */
export const svgenOpenImageRequest = writable<string | null>(null);
/** Set image id to copy exposed params onto the active Generate session (consumed by Webui/SvGenPanel). */
export const svgenUseParamsRequest = writable<string | null>(null);

export function clearSvgenSeedControlState() {
    svgenFrozenSeedsStore.set(new Set());
    svgenLastUsedSeedsStore.set(new Map());
}

export function clearSvgenNodePreviews() {
    svgenNodePreviewsStore.set(new Map());
}

export function clearSvgenNodePreviewsForSession(sessionId: string) {
    if (!sessionId)
        return;
    const prefix = `${sessionId}\0`;
    svgenNodePreviewsStore.update((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const key of next.keys()) {
            if (key.startsWith(prefix)) {
                next.delete(key);
                changed = true;
            }
        }
        return changed ? next : prev;
    });
}

export function setSvgenNodePreviews(
    sessionId: string,
    nodeIds: string[],
    images: ComfyOutputImageRef[],
) {
    if (!sessionId || !nodeIds.length)
        return;
    const entry = makeNodePreviewEntry(images);
    if (!entry)
        return;
    // Blob cache keys ignore `rand` — drop the prior bytes so overwritten temp files refresh.
    invalidateAuthorizedBlobUrl(buildComfyViewPathFromRef(images[0]!));
    svgenNodePreviewsStore.update((prev) => {
        const next = new Map(prev);
        for (const id of nodeIds)
            next.set(nodePreviewStoreKey(sessionId, id), entry);
        return next;
    });
}

export function syncSvgenWithLocalStorage() {
    syncMemory('svgenUi', svgenUiStore);
    syncMemory('flyoutTab', flyoutTabStore);
}

export function requestOpenInPanel(imageId: string) {
    flyoutTabStore.set('generate');
    svgenOpenImageRequest.set(imageId);
}

export function requestUseParamsFromImage(imageId: string) {
    flyoutTabStore.set('generate');
    svgenUseParamsRequest.set(imageId);
}
