<script lang="ts">
    import { createEventDispatcher, onDestroy } from "svelte";
    import Modal from "$lib/items/Modal.svelte";
    import Button from "$lib/items/Button.svelte";
    import Input from "$lib/items/Input.svelte";
    import Select from "$lib/items/Select.svelte";
    import OptionSelect from "$lib/items/OptionSelect.svelte";
    import TagPillRow from "$lib/components/TagPillRow.svelte";
    import TagPickerPopup from "$lib/components/TagPickerPopup.svelte";
    import TagModal from "$lib/components/TagModal.svelte";
    import { tagsStore, upsertTagDefinition } from "$lib/stores/tagsStore";
    import { DEFAULT_TAG_COLOR } from "$lib/types/tags";
    import { bulkModalStore } from "$lib/stores/bulkStore";
    import {
        CUSTOM_INSTRUCTION_ID,
        llmStore,
        resolveSystemInstruction,
    } from "$lib/stores/llmStore";
    import type { SearchParams } from "$lib/stores/searchStore";
    import { resolveSearchMatch, runBulkAction } from "$lib/requests/bulkRequests";
    import { fetchFolderPaths } from "$lib/requests/miscRequests";
    import { formatDurationCompact, formatTaskDuration } from "$lib/tools/misc";
    import type { BulkAction, BulkAnnotateMode, BulkRequest } from "$lib/types/requests";
    import type { BulkActionType } from "$lib/stores/bulkStore";
    import { askConfirmation } from "./Confirm.svelte";
    import { notify } from "./Notifier.svelte";

    const bulkActions = ["move", "copy", "delete", "annotate", "tag"] as const;
    const tagModes = ["add", "remove", "replace"] as const;

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

    let tagPickerOpen = false;
    let tagModalOpen = false;
    let modalTagName = "";
    let modalTagColor = DEFAULT_TAG_COLOR;
    let tagsRowEl: HTMLDivElement | undefined;

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

    $: systemInstructionOptions = [
        ...$llmStore.systemInstructions.map((instruction) => ({
            value: instruction.id,
            label: instruction.name,
            title: instruction.text,
        })),
        { value: CUSTOM_INSTRUCTION_ID, label: "Custom" },
    ];

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

    function bulkActionSubtitle(
        action: BulkActionType,
        annotateMode: BulkAnnotateMode,
        count: number,
    ): string {
        const images = `${count} image${count === 1 ? "" : "s"} matching the current filter`;
        switch (action) {
            case "move":
                return `Move ${images}.`;
            case "copy":
                return `Copy ${images}.`;
            case "delete":
                return `Delete ${images}.`;
            case "annotate":
                switch (annotateMode) {
                    case "generate":
                        return `Annotate ${images}.`;
                    case "clear":
                        return `Clear annotations on ${images}.`;
                    case "modify":
                        return `Modify annotations on ${images}.`;
                    default: {
                        const _exhaustive: never = annotateMode;
                        return _exhaustive;
                    }
                }
            case "tag":
                return `Tag ${images}.`;
            default: {
                const _exhaustive: never = action;
                return _exhaustive;
            }
        }
    }

    $: subtitle = bulkActionSubtitle(
        $bulkModalStore.action,
        $bulkModalStore.annotateMode,
        imageCount,
    );

    $: availableTags = $tagsStore.tags
        .map((tag) => tag.name)
        .filter((name) => !$bulkModalStore.selectedTags.includes(name));

    $: llmConfigured = Boolean($llmStore.modelId.trim() && $llmStore.baseUrl.trim());
    $: annotateGenerateBlocked =
        $bulkModalStore.action === "annotate"
        && $bulkModalStore.annotateMode === "generate"
        && !llmConfigured;

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

    function addBulkTag(name: string) {
        bulkModalStore.update((settings) => {
            if (settings.selectedTags.includes(name)) return settings;
            return { ...settings, selectedTags: [...settings.selectedTags, name] };
        });
    }

    function removeBulkTag(name: string) {
        bulkModalStore.update((settings) => ({
            ...settings,
            selectedTags: settings.selectedTags.filter((tag) => tag !== name),
        }));
    }

    function toggleTagPicker() {
        tagPickerOpen = !tagPickerOpen;
    }

    function closeTagPicker() {
        tagPickerOpen = false;
    }

    function openCreateTagModal() {
        modalTagName = "";
        modalTagColor = DEFAULT_TAG_COLOR;
        tagModalOpen = true;
    }

    function closeCreateTagModal() {
        tagModalOpen = false;
    }

    async function saveNewTag(event: CustomEvent<{ name: string; color: string }>) {
        const { name, color } = event.detail;
        const duplicate = $tagsStore.tags.some(
            (item) => item.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
            notify(`Tag name '${name}' already exists`, "warn");
            return;
        }

        tagsStore.update((state) => upsertTagDefinition(state, { name, color }));
        tagModalOpen = false;
        addBulkTag(name);
    }

    async function loadFolders() {
        try {
            folders = await fetchFolderPaths();
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
            case "tag":
                return {
                    type: "tag",
                    mode: s.tagMode,
                    tags: s.selectedTags,
                };
            default: {
                const _exhaustive: never = s.action;
                return _exhaustive;
            }
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
            const mode = bulkAction.mode as BulkAnnotateMode;
            switch (mode) {
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
                    const _exhaustive: never = mode;
                    return _exhaustive;
                }
            }
        }

        if (bulkAction.type === "tag") {
            if (!bulkAction.tags.length) {
                notify("Select at least one tag", "warn");
                return;
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
        tagPickerOpen = false;
        tagModalOpen = false;
        dispatch("close");
    }
</script>

<Modal close={close}>
        <h1>Bulk actions</h1>
        <p class="subtitle">{subtitle}</p>

        <fieldset class="actions" disabled={running}>
            <legend>Action</legend>
            <OptionSelect
                options={bulkActions}
                bind:value={$bulkModalStore.action}
                disabled={running}
            />
        </fieldset>

        {#if $bulkModalStore.action === "move" || $bulkModalStore.action === "copy"}
            <div class="select-field">
                <Select
                    prefix="Destination folder"
                    bind:value={$bulkModalStore.folder}
                    options={folders}
                    disabled={running}
                />
            </div>
        {/if}

        {#if $bulkModalStore.action === "annotate"}
            <div class="annotate">
                <div class="select-field">
                    <span class="field-label">Mode</span>
                    <OptionSelect
                        options={["generate", "clear", "modify"]}
                        bind:value={$bulkModalStore.annotateMode}
                        disabled={running}
                    />
                </div>

                {#if $bulkModalStore.annotateMode === "generate"}
                    <hr class="separator" />

                    {#if llmConfigured}
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

                    <div class="select-field">
                        <Select
                            prefix="System instruction"
                            bind:value={$bulkModalStore.systemInstructionPresetId}
                            options={systemInstructionOptions}
                            disabled={running}
                            title={systemInstructionTooltip || undefined}
                        />
                    </div>

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
                    {:else}
                        <p class="llm-warning">Configure the LLM API in Settings before using generate mode.</p>
                    {/if}
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

        {#if $bulkModalStore.action === "tag"}
            <div class="tag-bulk">
                <div class="select-field">
                    <span class="field-label">Mode</span>
                    <OptionSelect
                        options={tagModes}
                        bind:value={$bulkModalStore.tagMode}
                        disabled={running}
                    />
                </div>

                <div class="select-field">
                    <span class="field-label">Tags</span>
                    <div class="tags-row" bind:this={tagsRowEl}>
                        <TagPillRow
                            tags={$bulkModalStore.selectedTags}
                            showAdd
                            deletable
                            disabled={running}
                            on:add={toggleTagPicker}
                            on:remove={(event) => removeBulkTag(event.detail)}
                        />
                    </div>
                </div>
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
            <Button disabled={running || imageCount === 0 || annotateGenerateBlocked} on:click={execute}>
                {running ? "Running..." : "Run"}
            </Button>
            <Button disabled={running} on:click={close}>Cancel</Button>
        </div>
</Modal>

{#if tagPickerOpen}
    <TagPickerPopup
        anchor={tagsRowEl ?? null}
        tags={availableTags}
        on:select={(event) => addBulkTag(event.detail)}
        on:createNew={openCreateTagModal}
        on:close={closeTagPicker}
    />
{/if}

{#if tagModalOpen}
    <TagModal
        title="Add tag"
        bind:name={modalTagName}
        bind:color={modalTagColor}
        on:save={saveNewTag}
        on:close={closeCreateTagModal}
    />
{/if}

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
        padding: 0.3em 0.75em 0.75em 0.75em;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 0.35em;
        margin-bottom: 0.75em;
        cursor: pointer;
        user-select: none;

        &.checkbox {
            flex-direction: row;
            align-items: center;
        }
    }

    .hint {
        font-size: 0.8em;
        color: #aaa;
    }

    .llm-warning {
        margin: 0;
        font-size: 0.9em;
        color: #e8a060;
        line-height: 1.4;
    }

    textarea {
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

    .annotate {
        display: flex;
        flex-direction: column;
        gap: 0.25em;
        margin-bottom: 0.5em;
    }

    .select-field {
        margin-bottom: 0.75em;
    }

    .field-label {
        display: block;
        margin-bottom: 0.35em;
        color: #ccc;
    }

    .tag-bulk {
        display: flex;
        flex-direction: column;
        gap: 0.25em;
        margin-bottom: 0.5em;
    }

    .tags-row {
        position: relative;
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

    input[type="checkbox"] {
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

</style>
