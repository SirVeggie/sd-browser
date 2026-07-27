import { get } from 'svelte/store';
import type { ComfyPrompt, ComfyWorkflow } from '$lib/types/images';
import { emptyLayout } from './layout';
import {
    clearSvgenNodePreviews,
    clearSvgenNodePreviewsForSession,
    clearSvgenSeedControlState,
    svgenFrozenSeedsStore,
    svgenLastUsedSeedsStore,
    svgenLayoutStore,
    svgenOpenSessionsStore,
    svgenSessionStore,
} from './stores';
import type { SvgenLayoutState, SvgenOpenSession, SvgenSession } from './types';

const OPEN_SESSIONS_KEY = 'svgenOpenSessions';
const OPEN_SESSIONS_SAVE_DEBOUNCE_MS = 250;

let sessionSeq = 0;
/** Skip live→bag flush while switching/hydrating (activeId may lag live stores). */
let suspendLivePersist = false;
let openSessionsSaveTimer: ReturnType<typeof setTimeout> | undefined;
let openSessionsSyncStarted = false;

export function createOpenSessionId(): string {
    sessionSeq += 1;
    return `sess-${Date.now()}-${sessionSeq}`;
}

/** Make `base` unique among currently open session names (`Name`, `Name (2)`, …). */
export function uniqueOpenName(base: string, openNames: readonly string[]): string {
    const trimmed = base.trim() || 'Untitled workflow';
    const used = new Set(openNames);
    if (!used.has(trimmed))
        return trimmed;
    let n = 2;
    while (used.has(`${trimmed} (${n})`))
        n += 1;
    return `${trimmed} (${n})`;
}

function seedSnapshot(): { frozenSeeds: string[]; lastUsedSeeds: [string, number][] } {
    return {
        frozenSeeds: [...get(svgenFrozenSeedsStore)],
        lastUsedSeeds: [...get(svgenLastUsedSeedsStore).entries()],
    };
}

function applySeeds(frozenSeeds: string[], lastUsedSeeds: [string, number][]) {
    svgenFrozenSeedsStore.set(new Set(frozenSeeds));
    svgenLastUsedSeedsStore.set(new Map(lastUsedSeeds));
}

function toLegacySession(open: SvgenOpenSession): SvgenSession {
    return {
        workflowId: open.workflowId,
        name: open.name,
        workflow: open.workflow,
        prompt: open.prompt,
        sourceImageId: open.sourceImageId,
    };
}

function withSuspendedLivePersist(fn: () => void) {
    suspendLivePersist = true;
    try {
        fn();
    } finally {
        suspendLivePersist = false;
    }
}

function isComfyWorkflow(value: unknown): value is ComfyWorkflow {
    return !!value
        && typeof value === 'object'
        && Array.isArray((value as ComfyWorkflow).nodes);
}

function isOpenSession(value: unknown): value is SvgenOpenSession {
    if (!value || typeof value !== 'object')
        return false;
    const s = value as SvgenOpenSession;
    return typeof s.id === 'string'
        && s.id.length > 0
        && (s.workflowId === null || typeof s.workflowId === 'string')
        && typeof s.name === 'string'
        && isComfyWorkflow(s.workflow)
        && (s.prompt === null || (typeof s.prompt === 'object' && !Array.isArray(s.prompt)))
        && (s.sourceImageId === null || typeof s.sourceImageId === 'string')
        && !!s.layout
        && typeof s.layout === 'object'
        && Array.isArray(s.frozenSeeds)
        && Array.isArray(s.lastUsedSeeds);
}

function parseOpenSessionsBag(raw: unknown): {
    sessions: SvgenOpenSession[];
    activeId: string | null;
} | null {
    if (!raw || typeof raw !== 'object')
        return null;
    const bag = raw as { sessions?: unknown; activeId?: unknown };
    if (!Array.isArray(bag.sessions))
        return null;
    const sessions = bag.sessions.filter(isOpenSession);
    if (!sessions.length)
        return { sessions: [], activeId: null };
    const activeId = typeof bag.activeId === 'string' && sessions.some((s) => s.id === bag.activeId)
        ? bag.activeId
        : sessions[0]!.id;
    return { sessions, activeId };
}

function writeOpenSessionsToLocalStorage(immediate = false) {
    const save = () => {
        try {
            localStorage.setItem(OPEN_SESSIONS_KEY, JSON.stringify(get(svgenOpenSessionsStore)));
        } catch {
            /* quota / private mode — keep in-memory state */
        }
    };
    if (immediate) {
        if (openSessionsSaveTimer)
            clearTimeout(openSessionsSaveTimer);
        openSessionsSaveTimer = undefined;
        save();
        return;
    }
    if (openSessionsSaveTimer)
        clearTimeout(openSessionsSaveTimer);
    openSessionsSaveTimer = setTimeout(save, OPEN_SESSIONS_SAVE_DEBOUNCE_MS);
}

/** Write the live active stores back into the open-sessions bag. */
export function persistActiveOpenSession() {
    const bag = get(svgenOpenSessionsStore);
    if (!bag.activeId)
        return;
    const live = get(svgenSessionStore);
    if (!live)
        return;
    const seeds = seedSnapshot();
    const next: SvgenOpenSession = {
        id: bag.activeId,
        workflowId: live.workflowId,
        name: live.name,
        workflow: live.workflow,
        prompt: live.prompt,
        sourceImageId: live.sourceImageId,
        layout: get(svgenLayoutStore),
        frozenSeeds: seeds.frozenSeeds,
        lastUsedSeeds: seeds.lastUsedSeeds,
    };
    svgenOpenSessionsStore.set({
        activeId: bag.activeId,
        sessions: bag.sessions.map((s) => (s.id === bag.activeId ? next : s)),
    });
}

function flushLiveIntoOpenSessions() {
    if (suspendLivePersist)
        return;
    persistActiveOpenSession();
}

function loadOpenSessionIntoStores(open: SvgenOpenSession) {
    svgenSessionStore.set(toLegacySession(open));
    svgenLayoutStore.set(open.layout);
    applySeeds(open.frozenSeeds, open.lastUsedSeeds);
}

/** Restore live session/layout/seed stores from the active open session (after bag load). */
export function hydrateActiveOpenSession() {
    const bag = get(svgenOpenSessionsStore);
    if (!bag.activeId)
        return;
    const open = bag.sessions.find((s) => s.id === bag.activeId);
    if (!open)
        return;
    withSuspendedLivePersist(() => {
        loadOpenSessionIntoStores(open);
    });
}

/**
 * Persist open Generate sessions (workflows + layouts + seed prefs) in localStorage
 * and keep the bag flushed from live stores so refresh restores tabs.
 */
export function syncOpenSessionsWithLocalStorage() {
    if (openSessionsSyncStarted || typeof localStorage === 'undefined')
        return;
    openSessionsSyncStarted = true;

    try {
        const raw = localStorage.getItem(OPEN_SESSIONS_KEY);
        if (raw) {
            const parsed = parseOpenSessionsBag(JSON.parse(raw) as unknown);
            if (parsed) {
                withSuspendedLivePersist(() => {
                    svgenOpenSessionsStore.set(parsed);
                    if (parsed.activeId) {
                        const open = parsed.sessions.find((s) => s.id === parsed.activeId);
                        if (open)
                            loadOpenSessionIntoStores(open);
                    }
                });
            }
        }
    } catch {
        /* corrupt — start empty */
    }

    svgenOpenSessionsStore.subscribe(() => {
        writeOpenSessionsToLocalStorage();
    });
    svgenSessionStore.subscribe(() => {
        flushLiveIntoOpenSessions();
    });
    svgenLayoutStore.subscribe(() => {
        flushLiveIntoOpenSessions();
    });
    svgenFrozenSeedsStore.subscribe(() => {
        flushLiveIntoOpenSessions();
    });
    svgenLastUsedSeedsStore.subscribe(() => {
        flushLiveIntoOpenSessions();
    });

    const flushNow = () => {
        flushLiveIntoOpenSessions();
        writeOpenSessionsToLocalStorage(true);
    };
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);
}

export function activateOpenSession(id: string) {
    const bag = get(svgenOpenSessionsStore);
    if (bag.activeId === id)
        return;
    const target = bag.sessions.find((s) => s.id === id);
    if (!target)
        return;
    persistActiveOpenSession();
    withSuspendedLivePersist(() => {
        loadOpenSessionIntoStores(target);
        svgenOpenSessionsStore.update((prev) => ({ ...prev, activeId: id }));
    });
}

export function closeOpenSession(id: string) {
    const bag = get(svgenOpenSessionsStore);
    const idx = bag.sessions.findIndex((s) => s.id === id);
    if (idx < 0)
        return;
    if (bag.activeId === id)
        persistActiveOpenSession();
    const sessions = bag.sessions.filter((s) => s.id !== id);
    clearSvgenNodePreviewsForSession(id);
    if (!sessions.length) {
        withSuspendedLivePersist(() => {
            svgenOpenSessionsStore.set({ sessions: [], activeId: null });
            svgenSessionStore.set(null);
            svgenLayoutStore.set(emptyLayout());
            clearSvgenSeedControlState();
            clearSvgenNodePreviews();
        });
        return;
    }
    let activeId = bag.activeId;
    if (activeId === id) {
        const next = sessions[Math.min(idx, sessions.length - 1)]!;
        activeId = next.id;
        withSuspendedLivePersist(() => {
            loadOpenSessionIntoStores(next);
            svgenOpenSessionsStore.set({ sessions, activeId });
        });
        return;
    }
    svgenOpenSessionsStore.set({ sessions, activeId });
}

export function addOpenSession(payload: {
    name: string;
    workflow: ComfyWorkflow;
    prompt?: ComfyPrompt | null;
    sourceImageId?: string | null;
    layout?: SvgenLayoutState;
    /** Prefer unique among current open names (default true). */
    uniquifyName?: boolean;
}): string {
    persistActiveOpenSession();
    const bag = get(svgenOpenSessionsStore);
    const name = payload.uniquifyName === false
        ? (payload.name.trim() || 'Untitled workflow')
        : uniqueOpenName(
            payload.name,
            bag.sessions.map((s) => s.name),
        );
    const id = createOpenSessionId();
    const open: SvgenOpenSession = {
        id,
        workflowId: null,
        name,
        workflow: payload.workflow,
        prompt: payload.prompt ?? null,
        sourceImageId: payload.sourceImageId ?? null,
        layout: payload.layout ?? emptyLayout(),
        frozenSeeds: [],
        lastUsedSeeds: [],
    };
    withSuspendedLivePersist(() => {
        loadOpenSessionIntoStores(open);
        svgenOpenSessionsStore.set({
            sessions: [...bag.sessions, open],
            activeId: id,
        });
    });
    return id;
}

export function patchActiveOpenSession(
    patch: Partial<Pick<SvgenOpenSession, 'workflowId' | 'name' | 'workflow' | 'prompt' | 'sourceImageId' | 'layout'>>,
) {
    const bag = get(svgenOpenSessionsStore);
    if (!bag.activeId)
        return;
    const live = get(svgenSessionStore);
    if (!live)
        return;
    if (patch.workflowId !== undefined || patch.name !== undefined
        || patch.workflow !== undefined || patch.prompt !== undefined
        || patch.sourceImageId !== undefined) {
        svgenSessionStore.set({
            workflowId: patch.workflowId !== undefined ? patch.workflowId : live.workflowId,
            name: patch.name !== undefined ? patch.name : live.name,
            workflow: patch.workflow !== undefined ? patch.workflow : live.workflow,
            prompt: patch.prompt !== undefined ? patch.prompt : live.prompt,
            sourceImageId: patch.sourceImageId !== undefined
                ? patch.sourceImageId
                : live.sourceImageId,
        });
    }
    if (patch.layout)
        svgenLayoutStore.set(patch.layout);
    persistActiveOpenSession();
}
