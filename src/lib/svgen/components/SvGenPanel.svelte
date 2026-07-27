<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { flyoutState } from '$lib/stores/flyoutStore';
    import {
        flyoutTabStore,
        setSessionFromWorkflow,
        svgenErrorStore,
        svgenFrozenSeedsStore,
        svgenGeneratingStore,
        svgenLastUsedSeedsStore,
        svgenLayoutStore,
        svgenObjectInfoStore,
        svgenProgressStore,
        svgenSessionStore,
        svgenStatusStore,
    } from '$lib/svgen/stores';
    import {
        clearQueued,
        convertWorkflow,
        deleteQueued,
        fetchObjectInfo,
        fetchPendingPanelWorkflow,
        fetchQueue,
        fetchSvgenStatus,
        getLayout,
        getWorkflow,
        interruptPrompt,
        listWorkflows,
        openFromImage,
        putLayout,
        saveWorkflow,
        submitPrompt,
        SvgenComfyAuthError,
    } from '$lib/svgen/comfyClient';
    import { connectComfyWs, createClientId } from '$lib/svgen/comfyWs';
    import { applyFieldOrderAndHidden, discoverCards, setWidgetValue } from '$lib/svgen/fields';
    import {
        applyIntControlsAfterQueue,
        captureLastUsedSeeds,
    } from '$lib/svgen/intControl';
    import {
        effectiveColumnCount,
        emptyLayout,
        ensureBaseLayouts,
        writePlacementColumns,
        parseLayoutJson,
        placementForCount,
        signaturesFromCards,
    } from '$lib/svgen/layout';
    import {
        activeQueueCount,
        desiredQueueTotal,
        normalizeQueueEntries,
        queueHistoryStatusFromTerminal,
        syncKnownQueueItems,
        upsertQueueHistoryItem,
        type KnownQueueItem,
        type SvgenQueueItem,
    } from '$lib/svgen/queue';
    import type { SvgenCard, SvgenWorkflowSummary } from '$lib/svgen/types';
    import type { ComfyPrompt, ComfyWorkflow } from '$lib/types/images';
    import { get } from 'svelte/store';
    import SvGenColumns from './SvGenColumns.svelte';
    import SvGenGenerateBar from './SvGenGenerateBar.svelte';
    import SvGenQueueBar from './SvGenQueueBar.svelte';
    import SvGenQueueList from './SvGenQueueList.svelte';

    const COMFY_TOKEN_KEY = 'comfyWorkflowOpenToken';
    const PENDING_PANEL_POLL_MS = 1500;
    const QUEUE_POLL_MS = 1500;

    let clientId = createClientId();
    let disconnectWs: (() => void) | undefined;
    let pendingPanelPollTimer: ReturnType<typeof setInterval> | undefined;
    let queuePollTimer: ReturnType<typeof setTimeout> | undefined;
    let lastPendingPanelId: string | null = null;
    let panelEl: HTMLDivElement;
    let panelWidth = 400;
    let queueCount = 1;
    let infinite = false;
    let keepOneQueued = false;
    let infiniteActive = false;
    let queueOpen = false;
    let queueRunningItems: SvgenQueueItem[] = [];
    let queuePendingItems: SvgenQueueItem[] = [];
    let queueHistoryItems: SvgenQueueItem[] = [];
    let knownQueueItems = new Map<string, KnownQueueItem>();
    let promptStartTimes = new Map<string, number>();
    let promptEndTimes = new Map<string, number>();
    let promptTerminalEvents = new Map<string, string>();
    let panelPromptIds = new Set<string>();
    let toppingUp = false;
    let workflows: SvgenWorkflowSummary[] = [];
    let resizeObserver: ResizeObserver | undefined;
    let layoutSaveTimer: ReturnType<typeof setTimeout> | undefined;

    $: session = $svgenSessionStore;
    $: layout = $svgenLayoutStore;
    // Depend on field-order/hidden slices only — collapse/placement must not rediscover cards.
    $: fieldOrder = layout.fieldOrder;
    $: hiddenFields = layout.hiddenFields;
    $: cards = session
        ? applyFieldOrderAndHidden(
            discoverCards(session.workflow, $svgenObjectInfoStore),
            fieldOrder,
            hiddenFields,
        )
        : [];
    $: columnCount = effectiveColumnCount(panelWidth, layout);
    $: placement = placementForCount(layout, columnCount);
    $: progress = $svgenProgressStore;
    $: status = $svgenStatusStore;
    $: error = $svgenErrorStore;
    $: queueActive = activeQueueCount(queueRunningItems.length, queuePendingItems.length);
    $: queueBusy = queueRunningItems.length > 0 || infiniteActive;

    function getStoredComfyToken(): string | undefined {
        try {
            return sessionStorage.getItem(COMFY_TOKEN_KEY)?.trim() || undefined;
        } catch {
            return undefined;
        }
    }

    function setStoredComfyToken(token: string) {
        try {
            sessionStorage.setItem(COMFY_TOKEN_KEY, token);
        } catch {
            /* ignore */
        }
    }

    async function refreshStatus() {
        try {
            const next = await fetchSvgenStatus(getStoredComfyToken());
            svgenStatusStore.set(next);
            if (next.available) {
                reconnectProgressBridge();
                try {
                    svgenObjectInfoStore.set(await fetchObjectInfo(getStoredComfyToken()));
                } catch {
                    /* optional */
                }
            }
        } catch (cause) {
            svgenStatusStore.set({
                available: false,
                reason: cause instanceof Error ? cause.message : 'Status check failed',
            });
        }
    }

    function recordPromptExecutionStart(promptId: string | null, timestamp?: number) {
        if (!promptId)
            return;
        const startedAt = typeof timestamp === 'number' ? timestamp : Date.now();
        if (!promptStartTimes.has(promptId))
            promptStartTimes.set(promptId, startedAt);
        const known = knownQueueItems.get(promptId);
        if (known && known.startedAt == null) {
            known.startedAt = startedAt;
            known.status = 'running';
            knownQueueItems = new Map(knownQueueItems);
        }
    }

    function recordPromptExecutionEnd(
        promptId: string | null,
        terminal: string,
        timestamp?: number,
    ) {
        if (!promptId)
            return;
        promptEndTimes.set(promptId, typeof timestamp === 'number' ? timestamp : Date.now());
        promptTerminalEvents.set(promptId, terminal);
    }

    function finalizeDepartedQueueItem(item: KnownQueueItem) {
        if (queueHistoryItems.some((entry) => entry.id === item.id)) {
            promptStartTimes.delete(item.id);
            promptEndTimes.delete(item.id);
            promptTerminalEvents.delete(item.id);
            return;
        }
        const start = promptStartTimes.get(item.id) ?? item.startedAt ?? null;
        const end = promptEndTimes.get(item.id) ?? null;
        let durationMs = start != null && end != null ? end - start : null;
        const terminal = promptTerminalEvents.get(item.id) ?? null;
        const hadStarted = start != null || item.status === 'running';
        if (durationMs == null && hadStarted && start != null)
            durationMs = Date.now() - start;
        queueHistoryItems = upsertQueueHistoryItem(queueHistoryItems, {
            id: item.id,
            number: item.number,
            status: queueHistoryStatusFromTerminal(terminal, hadStarted),
            durationMs: hadStarted ? durationMs : null,
            completedAt: Date.now(),
        });
        promptStartTimes.delete(item.id);
        promptEndTimes.delete(item.id);
        promptTerminalEvents.delete(item.id);
    }

    async function refreshQueueStatus(options: { skipTopUp?: boolean } = {}) {
        try {
            const result = await fetchQueue(getStoredComfyToken());
            queueRunningItems = normalizeQueueEntries(result.queue_running, 'running');
            queuePendingItems = normalizeQueueEntries(result.queue_pending, 'pending');
            const activeIds = new Set([
                ...queueRunningItems.map((entry) => entry.id),
                ...queuePendingItems.map((entry) => entry.id),
            ]);
            for (const id of [...panelPromptIds]) {
                if (!activeIds.has(id))
                    panelPromptIds.delete(id);
            }
            const synced = syncKnownQueueItems(
                knownQueueItems,
                queueRunningItems,
                queuePendingItems,
                promptStartTimes,
            );
            knownQueueItems = synced.next;
            for (const item of synced.departed)
                finalizeDepartedQueueItem(item);
            if (!options.skipTopUp)
                await maybeTopUpInfinite();
        } catch {
            // Offline / auth — status bar already reflects Comfy availability.
        }
    }

    function scheduleQueuePoll() {
        if (queuePollTimer)
            clearTimeout(queuePollTimer);
        queuePollTimer = setTimeout(() => {
            void refreshQueueStatus().finally(() => scheduleQueuePoll());
        }, QUEUE_POLL_MS);
    }

    async function maybeTopUpInfinite() {
        if (!infinite || !infiniteActive || toppingUp)
            return;
        toppingUp = true;
        try {
            const target = desiredQueueTotal(keepOneQueued);
            while (infinite && infiniteActive) {
                const total = queueRunningItems.length + queuePendingItems.length;
                if (total >= target)
                    break;
                const promptId = await queueOnePrompt();
                if (promptId) {
                    panelPromptIds.add(promptId);
                    if ((!infinite || !infiniteActive) && keepOneQueued) {
                        await deleteQueued([promptId], getStoredComfyToken());
                        break;
                    }
                }
                await refreshQueueStatus({ skipTopUp: true });
                if (!infinite || !infiniteActive)
                    break;
            }
        } catch (cause) {
            svgenErrorStore.set(cause instanceof Error ? cause.message : 'Infinite queue failed');
        } finally {
            toppingUp = false;
        }
    }

    async function stopInfiniteGeneration() {
        infiniteActive = false;
        svgenGeneratingStore.set(false);
        if (!keepOneQueued)
            return;
        try {
            await refreshQueueStatus({ skipTopUp: true });
            const pendingIds = queuePendingItems
                .map((entry) => entry.id)
                .filter((id) => panelPromptIds.has(id));
            if (pendingIds.length)
                await deleteQueued(pendingIds, getStoredComfyToken());
            await refreshQueueStatus({ skipTopUp: true });
        } catch (cause) {
            svgenErrorStore.set(cause instanceof Error ? cause.message : 'Stop infinite failed');
        }
    }

    function reconnectProgressBridge() {
        disconnectWs?.();
        disconnectWs = connectComfyWs(
            undefined,
            clientId,
            {
                onProgress: (p) => svgenProgressStore.set(p),
                onExecuting: (node, promptId) => {
                    if (node == null) {
                        svgenProgressStore.set(null);
                        if (!infiniteActive)
                            svgenGeneratingStore.set(false);
                    } else {
                        svgenProgressStore.update((prev) => ({
                            value: prev?.value ?? 0,
                            max: prev?.max ?? 1,
                            node,
                            promptId: promptId ?? prev?.promptId,
                        }));
                    }
                },
                onExecutionStart: (promptId, timestamp) => {
                    recordPromptExecutionStart(promptId, timestamp);
                },
                onExecutionEnd: (promptId, terminal, timestamp) => {
                    recordPromptExecutionEnd(promptId, terminal, timestamp);
                    void refreshQueueStatus({ skipTopUp: false });
                },
                onError: (err) => {
                    svgenErrorStore.set(
                        typeof err === 'object' && err && 'exception_message' in err
                            ? String((err as { exception_message: unknown }).exception_message)
                            : 'Execution error',
                    );
                    if (!infiniteActive)
                        svgenGeneratingStore.set(false);
                },
            },
            getStoredComfyToken(),
        );
    }

    async function refreshWorkflowList() {
        try {
            workflows = await listWorkflows();
        } catch {
            workflows = [];
        }
    }

    function scheduleLayoutSave() {
        if (!session?.workflowId)
            return;
        clearTimeout(layoutSaveTimer);
        layoutSaveTimer = setTimeout(() => {
            void putLayout(session!.workflowId!, $svgenLayoutStore).catch(() => undefined);
        }, 400);
    }

    let lastLayoutKey = '';

    $: sessionLayoutEpoch = session
        ? `${session.workflowId ?? 'unsaved'}:${session.sourceImageId ?? ''}:${session.name}`
        : '';

    function ensureLayoutForCards(nextCards: SvgenCard[], force = false) {
        const nodeIds = nextCards.map((c) => c.nodeId);
        const key = `${sessionLayoutEpoch}:${nodeIds.join(',')}`;
        const placed = placementForCount($svgenLayoutStore, columnCount).columns.flat();
        const placementEmpty = nodeIds.length > 0 && placed.length === 0;
        if (!force && !placementEmpty && key === lastLayoutKey)
            return;
        lastLayoutKey = key;
        const nodes = session?.workflow.nodes ?? [];
        svgenLayoutStore.update((prev) => {
            // Always rebuild base placements from the current card set when forced / empty.
            const base = force || placementEmpty ? {
                ...prev,
                columns: {
                    '1': { columns: [[]] },
                    '2': { columns: [[], []] },
                },
            } : prev;
            const ensured = ensureBaseLayouts(base, nodeIds);
            return {
                ...ensured,
                nodeSignatures: signaturesFromCards(nextCards, nodes),
            };
        });
    }

    $: if (session) {
        ensureLayoutForCards(cards);
    }

    function onFieldChange(
        nodeId: string,
        widgetName: string,
        value: string | number | boolean | null,
        valueIndex?: number,
        writeMode?: 'outer' | 'inner',
        innerNodeId?: string,
        outerValueIndex?: number,
    ) {
        if (!session)
            return;
        const workflow = setWidgetValue(
            session.workflow,
            nodeId,
            widgetName,
            value,
            valueIndex,
            writeMode,
            innerNodeId,
            outerValueIndex,
        );
        if (workflow === session.workflow)
            return;
        svgenSessionStore.update((s) => (s ? { ...s, workflow, prompt: null, dirty: true } : s));
    }

    function onToggleCollapse(nodeId: string) {
        svgenLayoutStore.update((prev) => {
            const set = new Set(prev.collapsedNodeIds);
            if (set.has(nodeId))
                set.delete(nodeId);
            else
                set.add(nodeId);
            return { ...prev, collapsedNodeIds: [...set] };
        });
        scheduleLayoutSave();
    }

    function onColumnsChange(columns: string[][]) {
        svgenLayoutStore.update((prev) => writePlacementColumns(prev, columnCount, columns));
        scheduleLayoutSave();
    }

    function onFieldOrderChange(nodeId: string, order: string[]) {
        svgenLayoutStore.update((prev) => ({
            ...prev,
            fieldOrder: { ...prev.fieldOrder, [nodeId]: order },
        }));
        scheduleLayoutSave();
    }

    function onHideField(nodeId: string, widgetName: string) {
        svgenLayoutStore.update((prev) => {
            const current = prev.hiddenFields[nodeId] ?? [];
            if (current.includes(widgetName))
                return prev;
            return {
                ...prev,
                hiddenFields: {
                    ...prev.hiddenFields,
                    [nodeId]: [...current, widgetName],
                },
            };
        });
        scheduleLayoutSave();
    }

    function applyControlsAfterQueuedPrompt(workflow: ComfyWorkflow): ComfyWorkflow {
        const objectInfo = get(svgenObjectInfoStore);
        const discovered = applyFieldOrderAndHidden(
            discoverCards(workflow, objectInfo),
            get(svgenLayoutStore).fieldOrder,
            get(svgenLayoutStore).hiddenFields,
        );
        const lastUsed = new Map(get(svgenLastUsedSeedsStore));
        captureLastUsedSeeds(discovered, lastUsed);
        svgenLastUsedSeedsStore.set(lastUsed);
        return applyIntControlsAfterQueue(
            workflow,
            discovered,
            get(svgenLayoutStore).intControlModes,
            get(svgenFrozenSeedsStore),
        );
    }

    async function queueOnePrompt(): Promise<string | undefined> {
        const current = get(svgenSessionStore);
        if (!current)
            return undefined;
        const prompt = await convertWorkflow(current.workflow, getStoredComfyToken());
        const result = await submitPrompt({
            prompt,
            workflow: current.workflow,
            clientId,
            comfyToken: getStoredComfyToken(),
        });
        const nextWorkflow = applyControlsAfterQueuedPrompt(current.workflow);
        svgenSessionStore.update((s) => (
            s
                ? {
                    ...s,
                    prompt,
                    workflow: nextWorkflow,
                    dirty: nextWorkflow !== s.workflow ? true : s.dirty,
                }
                : s
        ));
        return result.prompt_id;
    }

    async function queuePrompts(count: number) {
        svgenErrorStore.set(null);
        svgenGeneratingStore.set(true);
        try {
            for (let i = 0; i < Math.max(1, count); i++) {
                if (!get(svgenSessionStore))
                    break;
                const promptId = await queueOnePrompt();
                if (promptId)
                    panelPromptIds.add(promptId);
            }
            await refreshQueueStatus({ skipTopUp: true });
        } finally {
            if (!infiniteActive)
                svgenGeneratingStore.set(false);
        }
    }

    async function generate() {
        if (!session)
            return;
        svgenErrorStore.set(null);
        try {
            if (infinite) {
                if (!infiniteActive) {
                    infiniteActive = true;
                    svgenGeneratingStore.set(true);
                    await maybeTopUpInfinite();
                } else {
                    await stopInfiniteGeneration();
                }
                return;
            }
            await queuePrompts(queueCount);
        } catch (cause) {
            if (cause instanceof SvgenComfyAuthError) {
                const token = window.prompt(
                    'Enter the ComfyUI-Login API token from the Comfy console.',
                    getStoredComfyToken() ?? '',
                );
                if (token?.trim()) {
                    setStoredComfyToken(token.trim());
                    await generate();
                    return;
                }
            }
            svgenErrorStore.set(cause instanceof Error ? cause.message : 'Generate failed');
            infiniteActive = false;
            svgenGeneratingStore.set(false);
        }
    }

    async function stopCurrent() {
        try {
            await interruptPrompt(undefined, getStoredComfyToken());
            await refreshQueueStatus({ skipTopUp: true });
        } catch (cause) {
            svgenErrorStore.set(cause instanceof Error ? cause.message : 'Interrupt failed');
        }
    }

    async function onInfiniteChange(next: boolean) {
        const wasActive = infiniteActive;
        infinite = next;
        if (!infinite) {
            if (wasActive)
                await stopInfiniteGeneration();
            else
                infiniteActive = false;
        }
    }

    async function onKeepOneChange(next: boolean) {
        keepOneQueued = next;
        if (infinite && infiniteActive)
            await maybeTopUpInfinite();
    }

    async function saveCurrent() {
        if (!session)
            return;
        const name = session.name?.trim() || 'Untitled workflow';
        try {
            const saved = await saveWorkflow({
                id: session.workflowId ?? undefined,
                name,
                workflow: session.workflow,
                prompt: session.prompt,
                sourceImageId: session.sourceImageId,
            });
            svgenSessionStore.update((s) =>
                s ? { ...s, workflowId: saved.id, name, dirty: false } : s,
            );
            await putLayout(saved.id, $svgenLayoutStore);
            await refreshWorkflowList();
        } catch (cause) {
            svgenErrorStore.set(cause instanceof Error ? cause.message : 'Save failed');
        }
    }

    async function loadSaved(id: string) {
        try {
            const row = await getWorkflow(id);
            const raw = await getLayout(row.id);
            lastLayoutKey = '';
            setSessionFromWorkflow({
                workflowId: row.id,
                name: row.name,
                workflow: row.workflow,
                prompt: row.prompt,
                sourceImageId: row.sourceImageId,
            });
            const discovered = discoverCards(row.workflow, get(svgenObjectInfoStore));
            const saved = parseLayoutJson(raw);
            const layout = ensureBaseLayouts(saved, discovered.map((c) => c.nodeId));
            layout.nodeSignatures = signaturesFromCards(
                discovered,
                row.workflow.nodes ?? [],
            );
            svgenLayoutStore.set(layout);
            svgenErrorStore.set(null);
        } catch (cause) {
            svgenErrorStore.set(cause instanceof Error ? cause.message : 'Load failed');
        }
    }

    function downloadJson() {
        if (!session)
            return;
        const blob = new Blob([JSON.stringify(session.workflow, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${session.name || 'workflow'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function applyWorkflowSession(payload: {
        workflowId?: string | null;
        name: string;
        workflow: ComfyWorkflow;
        prompt?: ComfyPrompt | null;
        sourceImageId?: string | null;
        dirty?: boolean;
    }) {
        lastLayoutKey = '';
        setSessionFromWorkflow(payload);
        const discovered = discoverCards(payload.workflow, get(svgenObjectInfoStore));
        const nodeIds = discovered.map((c) => c.nodeId);
        const layout = ensureBaseLayouts(emptyLayout(), nodeIds);
        layout.nodeSignatures = signaturesFromCards(
            discovered,
            payload.workflow.nodes ?? [],
        );
        svgenLayoutStore.set(layout);
        if (!discovered.length) {
            const nodeCount = payload.workflow.nodes?.length ?? 0;
            svgenErrorStore.set(
                nodeCount
                    ? `Loaded ${nodeCount} nodes but found no editable fields. Is Comfy connected for object_info?`
                    : 'Workflow has no nodes.',
            );
        } else {
            svgenErrorStore.set(null);
        }
    }

    /** Public entry used by ImageFull */
    export async function openImage(imageId: string) {
        flyoutTabStore.set('generate');
        try {
            await refreshStatus();
            const data = await openFromImage(imageId);
            applyWorkflowSession({
                name: `Image ${imageId.slice(0, 8)}`,
                workflow: data.workflow,
                prompt: data.prompt,
                sourceImageId: data.sourceImageId,
                dirty: true,
            });
        } catch (cause) {
            svgenErrorStore.set(cause instanceof Error ? cause.message : 'Open failed');
        }
    }

    async function pollPendingPanelWorkflow() {
        try {
            const pending = await fetchPendingPanelWorkflow();
            if (!pending?.workflow)
                return;
            if (pending.id && pending.id === lastPendingPanelId)
                return;
            lastPendingPanelId = pending.id || null;
            flyoutState.set(true);
            flyoutTabStore.set('generate');
            applyWorkflowSession({
                name: pending.name?.trim() || 'From Comfy',
                workflow: pending.workflow,
                dirty: true,
            });
            void refreshStatus();
        } catch {
            // Comfy may be offline; keep polling quietly.
        }
    }

    function onGenerateHotkey(event: KeyboardEvent) {
        const isEnter = event.key === 'Enter'
            || event.code === 'Enter'
            || event.code === 'NumpadEnter';
        if (!isEnter || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey)
            return;
        if (!$flyoutState || $flyoutTabStore !== 'generate')
            return;
        event.preventDefault();
        event.stopPropagation();
        void generate();
    }

    onMount(() => {
        void refreshStatus();
        void refreshWorkflowList();
        void pollPendingPanelWorkflow();
        void refreshQueueStatus({ skipTopUp: true });
        scheduleQueuePoll();
        pendingPanelPollTimer = setInterval(() => {
            void pollPendingPanelWorkflow();
        }, PENDING_PANEL_POLL_MS);
        resizeObserver = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width)
                panelWidth = width;
        });
        if (panelEl)
            resizeObserver.observe(panelEl);
        window.addEventListener('keydown', onGenerateHotkey, true);
        return () => {
            window.removeEventListener('keydown', onGenerateHotkey, true);
        };
    });

    onDestroy(() => {
        disconnectWs?.();
        resizeObserver?.disconnect();
        clearTimeout(layoutSaveTimer);
        if (queuePollTimer)
            clearTimeout(queuePollTimer);
        if (pendingPanelPollTimer)
            clearInterval(pendingPanelPollTimer);
    });
</script>

<div class="panel" bind:this={panelEl}>
    <SvGenQueueBar
        {status}
        {progress}
        busy={queueBusy}
        {queueActive}
        {queueOpen}
        {workflows}
        currentName={session?.name ?? ''}
        dirty={!!session?.dirty}
        on:toggleQueue={async () => {
            queueOpen = !queueOpen;
            if (queueOpen)
                await refreshQueueStatus({ skipTopUp: true });
        }}
        on:save={saveCurrent}
        on:download={downloadJson}
        on:load={(e) => loadSaved(e.detail)}
        on:rename={(e) =>
            svgenSessionStore.update((s) => (s ? { ...s, name: e.detail, dirty: true } : s))}
    />

    {#if queueOpen}
        <SvGenQueueList
            running={queueRunningItems}
            pending={queuePendingItems}
            history={queueHistoryItems}
            on:clearPending={async () => {
                try {
                    await clearQueued(getStoredComfyToken());
                    await refreshQueueStatus({ skipTopUp: true });
                } catch (cause) {
                    svgenErrorStore.set(
                        cause instanceof Error ? cause.message : 'Clear queue failed',
                    );
                }
            }}
            on:cancel={async (e) => {
                try {
                    await deleteQueued([e.detail], getStoredComfyToken());
                    await refreshQueueStatus({ skipTopUp: true });
                } catch (cause) {
                    svgenErrorStore.set(
                        cause instanceof Error ? cause.message : 'Cancel failed',
                    );
                }
            }}
        />
    {/if}

    {#if error}
        <div class="error">{error}</div>
    {/if}

    {#if !session}
        <div class="empty">
            <p>No workflow loaded.</p>
            <p>Use “Open in panel” on an image, or load a saved workflow.</p>
        </div>
    {:else if !cards.length}
        <div class="empty">
            <p>No editable fields found in this workflow.</p>
            <p>
                {(session.workflow.nodes?.length ?? 0)} nodes loaded.
                Connect Comfy (status above), or open a different image.
            </p>
        </div>
    {:else}
        <SvGenColumns
            {cards}
            {placement}
            collapsedNodeIds={layout.collapsedNodeIds}
            on:fieldChange={(e) =>
                onFieldChange(
                    e.detail.nodeId,
                    e.detail.widgetName,
                    e.detail.value,
                    e.detail.valueIndex,
                    e.detail.writeMode,
                    e.detail.innerNodeId,
                    e.detail.outerValueIndex,
                )}
            on:toggleCollapse={(e) => onToggleCollapse(e.detail)}
            on:columnsChange={(e) => onColumnsChange(e.detail.columns)}
            on:fieldOrder={(e) => onFieldOrderChange(e.detail.nodeId, e.detail.order)}
            on:hideField={(e) => onHideField(e.detail.nodeId, e.detail.widgetName)}
            on:persistLayout={scheduleLayoutSave}
        />
    {/if}

    <SvGenGenerateBar
        disabled={!session || !status?.available}
        {infiniteActive}
        queueRunning={queueRunningItems.length}
        bind:queueCount
        {infinite}
        {keepOneQueued}
        on:generate={generate}
        on:stop={stopCurrent}
        on:infiniteChange={(e) => onInfiniteChange(e.detail)}
        on:keepOneChange={(e) => onKeepOneChange(e.detail)}
    />
</div>

<style lang="scss">
    .panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--bg);
        color: var(--ink);
    }

    .error {
        margin: 0.5rem 0.75rem;
        padding: 0.5rem 0.65rem;
        border-radius: 8px;
        background: color-mix(in srgb, var(--danger) 18%, transparent);
        border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
        color: var(--danger);
        font-size: 0.85rem;
    }

    .empty {
        flex: 1;
        display: grid;
        place-content: center;
        gap: 0.35rem;
        padding: 1.5rem;
        text-align: center;
        opacity: 0.75;
        font-size: 0.9rem;
    }
</style>
