<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { askConfirmation } from '$lib/components/Confirm.svelte';
    import { notify } from '$lib/components/Notifier.svelte';
    import { flyoutState } from '$lib/stores/flyoutStore';
    import {
        flyoutTabStore,
        setSvgenNodePreviews,
        svgenErrorStore,
        svgenFrozenSeedsStore,
        svgenGeneratingStore,
        svgenLastUsedSeedsStore,
        svgenLayoutStore,
        svgenObjectInfoStore,
        svgenOpenSessionsStore,
        svgenProgressStore,
        svgenSessionStore,
        svgenStatusStore,
    } from '$lib/svgen/stores';
    import {
        executedPreviewNodeIds,
        parseExecutedOutputImages,
    } from '$lib/svgen/nodePreviews';
    import {
        activateOpenSession,
        addOpenSession,
        closeOpenSession,
        patchActiveOpenSession,
        persistActiveOpenSession,
    } from '$lib/svgen/sessions';
    import {
        clearQueued,
        convertWorkflow,
        deleteQueued,
        deleteWorkflow,
        fetchObjectInfo,
        fetchPendingPanelWorkflow,
        fetchQueue,
        fetchSvgenStatus,
        getLayout,
        getWorkflow,
        interruptPrompt,
        listWorkflows,
        openFromImage,
        openWorkflowInComfy,
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
    import { applyParamsFromWorkflow } from '$lib/svgen/paramsInherit';
    import {
        effectiveColumnCount,
        emptyLayout,
        ensureBaseLayouts,
        writePlacementColumns,
        parseLayoutJson,
        placementForCount,
        signaturesFromCards,
    } from '$lib/svgen/layout';
    import { orderedNodeIdsForAutoLayout } from '$lib/svgen/cardOrder';
    import {
        matchableFromCards,
        matchableFromSignatures,
        pickBestSavedLayout,
        type SavedLayoutCandidate,
    } from '$lib/svgen/layoutInherit';
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
    import SvGenSaveModal from './SvGenSaveModal.svelte';

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
    /** prompt_id → open session id (so executed previews land on the right session). */
    let promptSessionById = new Map<string, string>();
    let toppingUp = false;
    let workflows: SvgenWorkflowSummary[] = [];
    let resizeObserver: ResizeObserver | undefined;
    let layoutSaveTimer: ReturnType<typeof setTimeout> | undefined;
    let statusPrimed = false;
    let saveModalOpen = false;

    $: session = $svgenSessionStore;
    $: layout = $svgenLayoutStore;
    $: openBag = $svgenOpenSessionsStore;
    // Depend on field-order/hidden slices only — collapse/placement must not rediscover cards.
    $: fieldOrder = layout.fieldOrder;
    $: hiddenFields = layout.hiddenFields;
    $: cards = session
        ? applyFieldOrderAndHidden(
            discoverCards(session.workflow, $svgenObjectInfoStore),
            fieldOrder,
        )
        : [];
    $: columnCount = effectiveColumnCount(panelWidth, layout);
    $: placement = placementForCount(layout, columnCount);
    $: progress = $svgenProgressStore;
    $: status = $svgenStatusStore;
    $: error = $svgenErrorStore;
    $: queueActive = activeQueueCount(queueRunningItems.length, queuePendingItems.length);
    $: queueBusy = queueRunningItems.length > 0 || infiniteActive;
    $: savedNames = workflows.map((w) => w.name);

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
        const prev = get(svgenStatusStore);
        try {
            const next = await fetchSvgenStatus(getStoredComfyToken());
            svgenStatusStore.set(next);
            if (statusPrimed) {
                if (prev?.available && !next.available) {
                    notify(
                        next.authRequired
                            ? 'Comfy authentication required'
                            : (next.reason || 'Comfy connection lost'),
                        'error',
                    );
                } else if (next.available && prev?.convert && !next.convert) {
                    notify('Comfy workflow convert unavailable', 'warn');
                }
            }
            statusPrimed = true;
            if (next.available) {
                reconnectProgressBridge();
                try {
                    svgenObjectInfoStore.set(await fetchObjectInfo(getStoredComfyToken()));
                } catch {
                    /* optional */
                }
            }
        } catch (cause) {
            const reason = cause instanceof Error ? cause.message : 'Status check failed';
            svgenStatusStore.set({
                available: false,
                reason,
            });
            if (statusPrimed && prev?.available)
                notify(reason, 'error');
            statusPrimed = true;
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
                if (!activeIds.has(id)) {
                    panelPromptIds.delete(id);
                    promptSessionById.delete(id);
                }
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
                    const sessionId = get(svgenOpenSessionsStore).activeId;
                    if (sessionId)
                        promptSessionById.set(promptId, sessionId);
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
                onExecuted: (data) => {
                    const images = parseExecutedOutputImages(data);
                    if (!images.length)
                        return;
                    const nodeIds = executedPreviewNodeIds(data);
                    if (!nodeIds.length)
                        return;
                    const promptId = data && typeof data === 'object' && 'prompt_id' in data
                        ? String((data as { prompt_id: unknown }).prompt_id ?? '')
                        : '';
                    const sessionId = promptId
                        ? (promptSessionById.get(promptId) ?? null)
                        : get(svgenOpenSessionsStore).activeId;
                    if (!sessionId)
                        return;
                    setSvgenNodePreviews(sessionId, nodeIds, images);
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

    $: sessionLayoutEpoch = openBag.activeId ?? '';

    function ensureLayoutForCards(nextCards: SvgenCard[], force = false) {
        const nodeIds = orderedNodeIdsForAutoLayout(nextCards);
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
        svgenSessionStore.update((s) => (s ? { ...s, workflow, prompt: null } : s));
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
            const nextForNode = current.includes(widgetName)
                ? current.filter((name) => name !== widgetName)
                : [...current, widgetName];
            const hiddenFields = { ...prev.hiddenFields };
            if (nextForNode.length)
                hiddenFields[nodeId] = nextForNode;
            else
                delete hiddenFields[nodeId];
            return { ...prev, hiddenFields };
        });
        scheduleLayoutSave();
    }

    function applyControlsAfterQueuedPrompt(workflow: ComfyWorkflow): ComfyWorkflow {
        const objectInfo = get(svgenObjectInfoStore);
        const discovered = applyFieldOrderAndHidden(
            discoverCards(workflow, objectInfo),
            get(svgenLayoutStore).fieldOrder,
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
                if (promptId) {
                    panelPromptIds.add(promptId);
                    const sessionId = get(svgenOpenSessionsStore).activeId;
                    if (sessionId)
                        promptSessionById.set(promptId, sessionId);
                }
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
            const message = cause instanceof Error ? cause.message : 'Generate failed';
            svgenErrorStore.set(message);
            notify(message, 'error');
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

    function openSaveModal() {
        if (!session)
            return;
        saveModalOpen = true;
    }

    async function saveWithName(name: string) {
        if (!session)
            return;
        const existing = workflows.find((w) => w.name === name);
        try {
            const saved = await saveWorkflow({
                id: existing?.id,
                name,
                workflow: session.workflow,
                prompt: session.prompt,
                sourceImageId: session.sourceImageId,
            });
            svgenSessionStore.update((s) =>
                s ? { ...s, workflowId: saved.id, name } : s,
            );
            await putLayout(saved.id, $svgenLayoutStore);
            persistActiveOpenSession();
            await refreshWorkflowList();
            saveModalOpen = false;
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : 'Save failed';
            svgenErrorStore.set(message);
            notify(message, 'error');
        }
    }

    async function openSavedCopy(id: string) {
        try {
            const row = await getWorkflow(id);
            const raw = await getLayout(row.id);
            const discovered = discoverCards(row.workflow, get(svgenObjectInfoStore));
            const saved = parseLayoutJson(raw);
            const layout = ensureBaseLayouts(saved, orderedNodeIdsForAutoLayout(discovered));
            layout.nodeSignatures = signaturesFromCards(
                discovered,
                row.workflow.nodes ?? [],
            );
            lastLayoutKey = '';
            addOpenSession({
                name: row.name,
                workflow: row.workflow,
                prompt: row.prompt,
                sourceImageId: row.sourceImageId,
                layout,
            });
            if (!discovered.length) {
                const nodeCount = row.workflow.nodes?.length ?? 0;
                svgenErrorStore.set(
                    nodeCount
                        ? `Loaded ${nodeCount} nodes but found no editable fields. Is Comfy connected for object_info?`
                        : 'Workflow has no nodes.',
                );
            } else {
                svgenErrorStore.set(null);
            }
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : 'Open failed';
            svgenErrorStore.set(message);
            notify(message, 'error');
        }
    }

    async function deleteSavedWorkflow(id: string) {
        const name = workflows.find((wf) => wf.id === id)?.name ?? 'this workflow';
        const confirmed = await askConfirmation(
            'Delete workflow',
            `Delete saved workflow '${name}'?`,
        );
        if (!confirmed)
            return;

        try {
            await deleteWorkflow(id);
            await refreshWorkflowList();
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : 'Delete failed';
            notify(message, 'error');
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

    async function openCurrentInComfy() {
        if (!session)
            return;
        try {
            await openWorkflowInComfy({
                workflow: session.workflow,
                imageId: session.sourceImageId,
                comfyToken: getStoredComfyToken(),
            });
            notify('Opened workflow in Comfy');
        } catch (cause) {
            if (cause instanceof SvgenComfyAuthError) {
                const token = window.prompt(
                    'Enter the ComfyUI-Login API token from the Comfy console.',
                    getStoredComfyToken() ?? '',
                );
                if (token?.trim()) {
                    setStoredComfyToken(token.trim());
                    await openCurrentInComfy();
                    return;
                }
            }
            const message = cause instanceof Error ? cause.message : 'Failed to open in Comfy';
            notify(message, 'error');
        }
    }

    async function collectSavedLayoutCandidates(): Promise<SavedLayoutCandidate[]> {
        if (!workflows.length) {
            try {
                workflows = await listWorkflows();
            } catch {
                workflows = [];
            }
        }
        const objectInfo = get(svgenObjectInfoStore);
        const results = await Promise.all(workflows.map(async (summary) => {
            try {
                const raw = await getLayout(summary.id);
                const layout = parseLayoutJson(raw);
                let cards = matchableFromSignatures(layout.nodeSignatures);
                if (!cards.length) {
                    const row = await getWorkflow(summary.id);
                    cards = matchableFromCards(discoverCards(row.workflow, objectInfo));
                } else {
                    cards = cards.map((card) => {
                        const names = new Set<string>([
                            ...(layout.fieldOrder[card.nodeId] ?? []),
                            ...(layout.hiddenFields[card.nodeId] ?? []),
                        ]);
                        for (const key of Object.keys(layout.intControlModes ?? {})) {
                            if (!key.startsWith(`${card.nodeId}:`))
                                continue;
                            const widget = key.slice(card.nodeId.length + 1).split(':').pop();
                            if (widget)
                                names.add(widget);
                        }
                        return { ...card, fieldNames: [...names] };
                    });
                }
                if (!cards.length)
                    return null;
                return {
                    workflowId: summary.id,
                    cards,
                    layout,
                } satisfies SavedLayoutCandidate;
            } catch {
                return null;
            }
        }));
        return results.filter((entry): entry is SavedLayoutCandidate => !!entry);
    }

    async function layoutForUnsavedOpen(
        discovered: SvgenCard[],
        workflowNodes: ComfyWorkflow['nodes'],
    ) {
        const orderedIds = orderedNodeIdsForAutoLayout(discovered);
        const candidates = await collectSavedLayoutCandidates();
        const best = pickBestSavedLayout(discovered, candidates);
        const layout = best?.layout ?? ensureBaseLayouts(emptyLayout(), orderedIds);
        layout.nodeSignatures = signaturesFromCards(discovered, workflowNodes ?? []);
        return layout;
    }

    async function applyWorkflowSession(payload: {
        name: string;
        workflow: ComfyWorkflow;
        prompt?: ComfyPrompt | null;
        sourceImageId?: string | null;
        layout?: ReturnType<typeof emptyLayout>;
    }) {
        lastLayoutKey = '';
        const discovered = discoverCards(payload.workflow, get(svgenObjectInfoStore));
        const layout = payload.layout
            ? (() => {
                const next = ensureBaseLayouts(
                    payload.layout,
                    orderedNodeIdsForAutoLayout(discovered),
                );
                next.nodeSignatures = signaturesFromCards(
                    discovered,
                    payload.workflow.nodes ?? [],
                );
                return next;
            })()
            : await layoutForUnsavedOpen(discovered, payload.workflow.nodes);
        addOpenSession({
            name: payload.name,
            workflow: payload.workflow,
            prompt: payload.prompt,
            sourceImageId: payload.sourceImageId,
            layout,
        });
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
            await applyWorkflowSession({
                name: `Image ${imageId.slice(0, 8)}`,
                workflow: data.workflow,
                prompt: data.prompt,
                sourceImageId: data.sourceImageId,
            });
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : 'Open failed';
            svgenErrorStore.set(message);
            notify(message, 'error');
        }
    }

    /** Copy exposed params from an image onto the active session workflow. */
    export async function useParamsFromImage(imageId: string) {
        flyoutTabStore.set('generate');
        const active = get(svgenSessionStore);
        if (!active) {
            notify('No workflow open in Generate panel', 'warn');
            return;
        }
        try {
            await refreshStatus();
            const data = await openFromImage(imageId);
            const { workflow, matchedCards, changedFields, setFields, totalFields } =
                applyParamsFromWorkflow({
                sourceWorkflow: data.workflow,
                targetWorkflow: active.workflow,
                objectInfo: get(svgenObjectInfoStore),
            });
            if (workflow !== active.workflow) {
                patchActiveOpenSession({ workflow, prompt: null });
            }
            if (!matchedCards) {
                notify('No matching nodes to apply params from', 'warn');
            } else {
                const valueWord = changedFields === 1 ? 'value' : 'values';
                const nodeWord = matchedCards === 1 ? 'node' : 'nodes';
                notify(
                    `Changed ${changedFields} ${valueWord} in ${matchedCards} ${nodeWord} (${setFields}/${totalFields})`,
                );
            }
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : 'Use params failed';
            svgenErrorStore.set(message);
            notify(message, 'error');
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
            await applyWorkflowSession({
                name: pending.name?.trim() || 'From Comfy',
                workflow: pending.workflow,
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
        {progress}
        busy={queueBusy}
        {queueActive}
        {queueOpen}
        {workflows}
        openSessions={openBag.sessions}
        activeSessionId={openBag.activeId}
        currentName={session?.name ?? ''}
        empty={!session}
        on:toggleQueue={async () => {
            queueOpen = !queueOpen;
            if (queueOpen)
                await refreshQueueStatus({ skipTopUp: true });
        }}
        on:save={openSaveModal}
        on:download={downloadJson}
        on:openInComfy={openCurrentInComfy}
        on:switchSession={(e) => activateOpenSession(e.detail)}
        on:closeSession={(e) => closeOpenSession(e.detail)}
        on:openSaved={(e) => openSavedCopy(e.detail)}
        on:deleteSaved={(e) => deleteSavedWorkflow(e.detail)}
    />

    {#if saveModalOpen && session}
        <SvGenSaveModal
            initialName={session.name}
            {savedNames}
            on:close={() => { saveModalOpen = false; }}
            on:save={(e) => saveWithName(e.detail)}
        />
    {/if}

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
            <p>No workflow open</p>
            <p>Pick a saved workflow from the menu above, or use Open in panel on an image / send from Comfy.</p>
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
            {hiddenFields}
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
