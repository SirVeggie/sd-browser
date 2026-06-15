<script lang="ts">
    import { createEventDispatcher, onDestroy } from "svelte";
    import Modal from "$lib/items/Modal.svelte";
    import Button from "$lib/items/Button.svelte";
    import Input from "$lib/items/Input.svelte";
    import { bulkModalStore } from "$lib/stores/bulkStore";
    import {
        CUSTOM_INSTRUCTION_ID,
        llmStore,
        resolveSystemInstruction,
    } from "$lib/stores/llmStore";
    import type { SearchParams } from "$lib/stores/searchStore";
    import { resolveSearchMatch, runBulkAction } from "$lib/requests/bulkRequests";
    import { fetchFolderStructure } from "$lib/requests/miscRequests";
    import { formatDurationCompact, formatTaskDuration, stringSort } from "$lib/tools/misc";
    import type { BulkAction, BulkRequest } from "$lib/types/requests";
    import { askConfirmation } from "./Confirm.svelte";
    import { notify } from "./Notifier.svelte";

    const dispatch = createEventDispatcher<{ close: void }>();

    export let imageCount = 0;
    export let searchParams: SearchParams;
    export let onComplete: (refresh?: boolean) => void = () => {};

    let abortController: AbortController | undefined;

    let folders: string[] = ["/"];
    let running = false;
    let progressDone = 0;
    let progressTotal = 0;
    let bulkStartTime = 0;
    let totalTaskDurationMs = 0;
    let progressFailures = 0;
    let effectiveTaskMsAtProgress = 0;
    let progressHovering = false;
    let tickNow = Date.now();
    let tickInterval: ReturnType<typeof setInterval> | undefined;

    $: progressPercent = progressTotal
        ? Math.min(100, (progressDone / progressTotal) * 100)
        : 0;

    $: showProgressStats = running && $bulkModalStore.action === "annotate";
    $: elapsedMs = bulkStartTime
        ? (progressHovering ? tickNow : Date.now()) - bulkStartTime
        : 0;
    $: averageTaskMs = progressDone > 0 ? totalTaskDurationMs / progressDone : undefined;
    $: effectiveTaskMs = progressDone > 0 ? elapsedMs / progressDone : undefined;
    $: timeLeftMs = progressDone > 0
        ? Math.max(0, progressTotal * effectiveTaskMsAtProgress - elapsedMs)
        : undefined;

    $: isCustomSystemInstruction =
        $bulkModalStore.systemInstructionPresetId === CUSTOM_INSTRUCTION_ID;

    $: systemInstructionTooltip = resolveSystemInstruction(
        $llmStore.systemInstructions,
        $bulkModalStore.systemInstructionPresetId,
        $bulkModalStore.systemInstruction,
    );

    $: {
        const presetId = $bulkModalStore.systemInstructionPresetId;
        if (
            presetId !== CUSTOM_INSTRUCTION_ID &&
            !$llmStore.systemInstructions.some((item) => item.id === presetId)
        ) {
            bulkModalStore.update((settings) => ({
                ...settings,
                systemInstructionPresetId: CUSTOM_INSTRUCTION_ID,
            }));
        }
    }

    function formatStat(ms: number | undefined) {
        return ms === undefined ? "—" : formatTaskDuration(ms);
    }

    function onProgressMouseEnter() {
        progressHovering = true;
        tickNow = Date.now();
        tickInterval = setInterval(() => {
            tickNow = Date.now();
        }, 1000);
    }

    function onProgressMouseLeave() {
        progressHovering = false;
        if (tickInterval) {
            clearInterval(tickInterval);
            tickInterval = undefined;
        }
    }

    onDestroy(() => {
        if (tickInterval) clearInterval(tickInterval);
    });

    async function loadFolders() {
        try {
            const structure = (await fetchFolderStructure())
                .sort(stringSort((x) => x.name))
                .reverse();
            const list: string[] = ["/"];

            while (structure.length) {
                const item = structure.pop()!;
                list.push(
                    `${item.parent}/${item.name}`
                        .replace(/^\//, "")
                        .replace(/\\/, "/"),
                );
                if (item.subfolders) {
                    structure.push(
                        ...item.subfolders
                            .sort(stringSort((x) => x.name))
                            .reverse(),
                    );
                }
            }

            folders = list;
            if (!folders.includes($bulkModalStore.folder)) {
                bulkModalStore.update((s) => ({ ...s, folder: folders[0] ?? "/" }));
            }
        } catch (e) {
            console.error(e);
            notify("Failed to load folders", "warn");
        }
    }

    loadFolders();
    running = false;
    progressDone = 0;
    progressTotal = imageCount;

    function buildAction(): BulkAction | undefined {
        const s = $bulkModalStore;
        switch (s.action) {
            case "move":
                return { type: "move", folder: s.folder };
            case "copy":
                return { type: "copy", folder: s.folder };
            case "delete":
                return { type: "delete" };
            case "annotate":
                return {
                    type: "annotate",
                    mode: s.annotateMode,
                    includeImage: s.includeImage,
                    includePrompt: s.includePrompt,
                    systemInstruction: resolveSystemInstruction(
                        $llmStore.systemInstructions,
                        s.systemInstructionPresetId,
                        s.systemInstruction,
                    ),
                    responsePrefix: s.responsePrefix,
                    disableThinking: s.disableThinking,
                    resultRegex: s.resultRegex.trim() || undefined,
                    resultTemplate: s.resultTemplate?.trim() || undefined,
                    appendResult: s.appendResult,
                };
        }
    }

    function buildRequest(bulkAction: BulkAction): BulkRequest {
        const request: BulkRequest = {
            ...searchParams,
            action: bulkAction,
        };

        if (bulkAction.type === "annotate") {
            request.llm = {
                baseUrl: $llmStore.baseUrl,
                apiKey: $llmStore.apiKey || undefined,
                modelId: $llmStore.modelId,
                parallelCalls: Math.max(1, $llmStore.parallelCalls || 1),
            };
        }

        return request;
    }

    async function execute() {
        if (running || imageCount === 0) return;

        const bulkAction = buildAction();
        if (!bulkAction) return;

        if (bulkAction.type === "annotate") {
            switch (bulkAction.mode) {
                case "generate":
                    if (!$llmStore.modelId || !$llmStore.baseUrl) {
                        notify("Configure LLM settings first", "warn");
                        return;
                    }
                    if (!bulkAction.includeImage && !bulkAction.includePrompt) {
                        notify("Enable at least one of Include image or Include prompt", "warn");
                        return;
                    }
                    break;
                case "modify":
                    if (!bulkAction.resultRegex?.trim()) {
                        notify("Result regex is required for modify mode", "warn");
                        return;
                    }
                    break;
                case "clear":
                    break;
                default: {
                    const _exhaustive: never = bulkAction.mode;
                    return _exhaustive;
                }
            }
        }

        running = true;
        progressDone = 0;
        totalTaskDurationMs = 0;
        progressFailures = 0;
        effectiveTaskMsAtProgress = 0;
        abortController = new AbortController();
        let refresh = false;

        try {
            const match = await resolveSearchMatch(searchParams);
            progressTotal = match.total;

            if (match.total === 0) {
                notify("No images match the current search", "warn");
                return;
            }

            if (bulkAction.type === "delete") {
                const confirmed = await askConfirmation(
                    "Delete images",
                    `Delete ${match.total} images matching the current search?`,
                );
                if (!confirmed) return;
            }

            bulkStartTime = Date.now();

            await runBulkAction(
                buildRequest(bulkAction),
                (event) => {
                    if ("done" in event) {
                        progressDone = event.done;
                        progressTotal = event.total;
                        if (event.done > 0 && bulkStartTime) {
                            effectiveTaskMsAtProgress = (Date.now() - bulkStartTime) / event.done;
                        }
                        if (event.totalTaskDurationMs !== undefined) {
                            totalTaskDurationMs = event.totalTaskDurationMs;
                        }
                        if (event.failures !== undefined) {
                            progressFailures = event.failures;
                        }
                    } else if ("complete" in event) {
                        refresh = !!event.refresh;
                    }
                },
                undefined,
                abortController.signal,
            );

            notify(`Bulk ${$bulkModalStore.action} complete (${progressTotal} images)`);
            onComplete(refresh);
            close();
        } catch (e: any) {
            if (e?.name === "AbortError") return;
            console.error(e);
            notify(e?.message ?? "Bulk action failed", "warn");
        } finally {
            running = false;
            abortController = undefined;
        }
    }

    function close() {
        abortController?.abort();
        abortController = undefined;
        running = false;
        dispatch("close");
    }
</script>

<Modal close={close}>
        <h1>Bulk actions</h1>
        <p class="subtitle">
            Apply to all {imageCount} images matching the current search filter.
        </p>

        <fieldset class="actions" disabled={running}>
            <legend>Action</legend>
            <label class="radio">
                <input type="radio" bind:group={$bulkModalStore.action} value="move" />
                Move
            </label>
            <label class="radio">
                <input type="radio" bind:group={$bulkModalStore.action} value="copy" />
                Copy
            </label>
            <label class="radio">
                <input type="radio" bind:group={$bulkModalStore.action} value="delete" />
                Delete
            </label>
            <label class="radio">
                <input type="radio" bind:group={$bulkModalStore.action} value="annotate" />
                Annotate
            </label>
        </fieldset>

        {#if $bulkModalStore.action === "move" || $bulkModalStore.action === "copy"}
            <label>
                Destination folder
                <select bind:value={$bulkModalStore.folder} disabled={running}>
                    {#each folders as path (path)}
                        <option value={path}>{path}</option>
                    {/each}
                </select>
            </label>
        {/if}

        {#if $bulkModalStore.action === "annotate"}
            <div class="annotate">
                <label>
                    Mode
                    <select bind:value={$bulkModalStore.annotateMode} disabled={running}>
                        <option value="generate">Generate</option>
                        <option value="clear">Clear</option>
                        <option value="modify">Modify</option>
                    </select>
                </label>

                {#if $bulkModalStore.annotateMode === "generate"}
                    <hr class="separator" />

                    <label class="checkbox" title="Positive prompt only">
                        <input
                            type="checkbox"
                            bind:checked={$bulkModalStore.includePrompt}
                            disabled={running}
                        />
                        Include prompt
                    </label>
                    <label class="checkbox">
                        <input
                            type="checkbox"
                            bind:checked={$bulkModalStore.includeImage}
                            disabled={running}
                        />
                        Include image
                    </label>

                    <label>
                        System instruction
                        <select
                            bind:value={$bulkModalStore.systemInstructionPresetId}
                            disabled={running}
                            title={systemInstructionTooltip || undefined}
                        >
                            {#each $llmStore.systemInstructions as instruction (instruction.id)}
                                <option
                                    value={instruction.id}
                                    title={instruction.text}
                                >
                                    {instruction.name}
                                </option>
                            {/each}
                            <option value={CUSTOM_INSTRUCTION_ID}>Custom</option>
                        </select>
                    </label>

                    {#if isCustomSystemInstruction}
                        <label>
                            Custom instruction
                            <textarea
                                bind:value={$bulkModalStore.systemInstruction}
                                disabled={running}
                                rows="4"
                            />
                        </label>
                    {/if}

                    <label>
                        Response prefix
                        <span class="hint">The LLM continues from this text</span>
                        <textarea
                            bind:value={$bulkModalStore.responsePrefix}
                            disabled={running}
                            rows="3"
                        />
                    </label>

                    <label class="checkbox">
                        <input
                            type="checkbox"
                            bind:checked={$bulkModalStore.disableThinking}
                            disabled={running}
                        />
                        Disable thinking
                    </label>

                    <!-- svelte-ignore a11y-label-has-associated-control -->
                    <label>
                        Result regex (optional)
                        <Input bind:value={$bulkModalStore.resultRegex} />
                    </label>

                    <label>
                        Result template (optional)
                        <span class="hint">Use $1, $2, … for regex capture groups</span>
                        <textarea
                            bind:value={$bulkModalStore.resultTemplate}
                            disabled={running}
                            rows="3"
                        />
                    </label>

                    <label class="checkbox">
                        <input
                            type="checkbox"
                            bind:checked={$bulkModalStore.appendResult}
                            disabled={running}
                        />
                        Append result
                    </label>
                {:else if $bulkModalStore.annotateMode === "modify"}
                    <hr class="separator" />

                    <!-- svelte-ignore a11y-label-has-associated-control -->
                    <label>
                        Result regex
                        <Input bind:value={$bulkModalStore.resultRegex} />
                    </label>

                    <label>
                        Result template (optional)
                        <span class="hint">Use $1, $2, … for regex capture groups. Matched against the existing annotation.</span>
                        <textarea
                            bind:value={$bulkModalStore.resultTemplate}
                            disabled={running}
                            rows="3"
                        />
                    </label>
                {/if}
            </div>
        {/if}

        {#if running}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                class="progress-wrap"
                class:has-stats={showProgressStats}
                on:mouseenter={onProgressMouseEnter}
                on:mouseleave={onProgressMouseLeave}
            >
                <div class="progress">
                    <div class="bar" style={`width: ${progressPercent}%`} />
                </div>
                {#if showProgressStats && progressHovering}
                    <div class="progress-stats" role="tooltip">
                        <div class="stat">
                            <span class="label">Elapsed time</span>
                            <span class="value">{formatDurationCompact(elapsedMs)}</span>
                        </div>
                        <div class="stat">
                            <span class="label">Average task time</span>
                            <span class="value">{formatStat(averageTaskMs)}</span>
                        </div>
                        <div class="stat">
                            <span class="label">Effective task time</span>
                            <span class="value">{formatStat(effectiveTaskMs)}</span>
                        </div>
                        <div class="stat">
                            <span class="label">Time left</span>
                            <span class="value">{timeLeftMs === undefined ? "—" : formatDurationCompact(timeLeftMs)}</span>
                        </div>
                        {#if progressFailures > 0}
                            <div class="stat">
                                <span class="label">Failed</span>
                                <span class="value fail">{progressFailures}</span>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
            <p class="progress-text">{progressDone} / {progressTotal}</p>
        {/if}

        <div class="buttons">
            <Button disabled={running || imageCount === 0} on:click={execute}>
                {running ? "Running..." : "Run"}
            </Button>
            <Button disabled={running} on:click={close}>Cancel</Button>
        </div>
</Modal>

<style lang="scss">
    h1 {
        margin: 0 0 0.25em;
    }

    .subtitle {
        margin-top: 0;
        color: #aaa;
        font-size: 0.9em;

    }

    fieldset {
        border: 1px solid #aaa4;
        border-radius: 0.5em;
        margin: 1em 0;
        padding: 0.75em 1em;
    }

    legend {
        padding: 0 0.5em;
        color: #ccc;
    }

    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 1em;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 0.35em;
        margin-bottom: 0.75em;
        cursor: pointer;
        user-select: none;

        &.checkbox,
        &.radio {
            flex-direction: row;
            align-items: center;
        }
    }

    .hint {
        font-size: 0.8em;
        color: #aaa;
    }

    textarea {
        font-family: "Open sans", sans-serif;
        width: 100%;
        min-width: min(500px, 80vw);
        background-color: #333;
        color: #ddd;
        border-radius: 0.5em;
        border: 1px solid #1118;
        padding: 0.5em;
        box-sizing: border-box;
        resize: vertical;

        &:focus {
            outline: none;
            border-color: #aaad;
        }
    }

    select {
        background-color: #333;
        color: #ddd;
        border: 1px solid #1118;
        border-radius: 0.5em;
        padding: 0.5em;
        font-family: "Open sans", sans-serif;
    }

    .annotate {
        display: flex;
        flex-direction: column;
        gap: 0.25em;
        margin-bottom: 0.5em;
    }

    .separator {
        border: none;
        border-top: 1px solid #aaa4;
        margin: 0.5em 0 0.75em;
    }

    .progress-wrap {
        position: relative;
        margin-top: 1em;

        &.has-stats {
            cursor: help;
        }
    }

    .progress {
        width: 100%;
        height: 0.75em;
        background: #333;
        border-radius: 0.5em;
        overflow: hidden;
    }

    .progress-stats {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 0.5em);
        transform: translateX(-50%);
        min-width: 14em;
        padding: 0.6em 0.75em;
        background: #222;
        border: 1px solid #555;
        border-radius: 0.5em;
        box-shadow: 0 4px 12px #0008;
        z-index: 1;
        pointer-events: none;

        &::after {
            content: "";
            position: absolute;
            left: 50%;
            top: 100%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-top-color: #555;
        }
    }

    .stat {
        display: flex;
        justify-content: space-between;
        gap: 1em;
        font-size: 0.85em;
        line-height: 1.5;

        & + .stat {
            margin-top: 0.15em;
        }
    }

    .label {
        color: #aaa;
    }

    .value {
        color: #eee;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;

        &.fail {
            color: #f08080;
        }
    }

    .bar {
        height: 100%;
        background: rgb(63, 187, 236);
        transition: width 0.15s ease;
    }

    .progress-text {
        margin: 0.35em 0 0;
        font-size: 0.9em;
        color: #aaa;
        text-align: center;
    }

    .buttons {
        display: flex;
        gap: 1em;
        justify-content: center;
        margin-top: 1.5em;
    }

    input[type="checkbox"],
    input[type="radio"] {
        appearance: none;
        background-color: #333;
        border-radius: 0.2em;
        width: 13px;
        height: 13px;
        margin: 0;
        border: none;
        cursor: pointer;
        position: relative;
        outline: 1px solid #aaa3;

        &::before {
            content: "";
            position: absolute;
            background-color: rgb(63, 187, 236);
            top: 2px;
            left: 2px;
            right: 2px;
            bottom: 2px;
            transform: scale(0);
            opacity: 0;
            transition:
                120ms transform ease,
                120ms opacity ease;
            border-radius: 0.15em;
        }

        &:checked::before {
            transform: scale(1);
            opacity: 1;
        }
    }

    input[type="radio"] {
        border-radius: 50%;

        &::before {
            border-radius: 50%;
        }
    }
</style>
