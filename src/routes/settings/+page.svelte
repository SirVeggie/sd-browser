<script lang="ts">
    import Input from "$lib/items/Input.svelte";
    import Select from "$lib/items/Select.svelte";
    import { onDestroy } from "svelte";
    import Link from "../../lib/items/Link.svelte";
    import {
        flyoutButton,
        flyoutButtonTop,
        flyoutHistory,
        flyoutStore,
    } from "$lib/stores/flyoutStore";
    import Button from "$lib/items/Button.svelte";
    import { notify } from "$lib/components/Notifier.svelte";
    import {
        animatedThumb,
        compressedMode,
        matchingMode,
        nsfwFilter,
        showNsfwFilter,
        similarityAlgorithm,
        similarityThreshold,
        slideDelay,
        sparseFrequency,
        thumbMode,
        useSmartSubsampling,
    } from "$lib/stores/searchStore";
    import {
        activeCustomFilterIds,
        customFiltersStore,
        reorderCustomFiltersByIds,
        type CustomFilter,
    } from "$lib/stores/customFiltersStore";
    import {
        flyoutModes,
        qualityModes,
        searchKeywords,
        searchModes,
        similarityAlgorithms,
    } from "$lib/types/misc";
    import { fullscreenState } from "$lib/stores/fullscreenStore";
    import {
        imageFadeMs,
        fullscreenStyle,
        imageFlow,
        imageSize,
        imageSpacing,
    } from "$lib/stores/styleStore";
    import NumInput from "$lib/items/NumInput.svelte";
    import SystemInstructionModal from "$lib/components/SystemInstructionModal.svelte";
    import CustomFilterModal from "$lib/components/CustomFilterModal.svelte";
    import SearchKeywordHelpModal from "$lib/components/SearchKeywordHelpModal.svelte";
    import TagModal from "$lib/components/TagModal.svelte";
    import TagPillRow from "$lib/components/TagPillRow.svelte";
    import { askConfirmation } from "$lib/components/Confirm.svelte";
    import {
        llmStore,
        type SystemInstruction,
    } from "$lib/stores/llmStore";
    import { embeddingStore } from "$lib/stores/embeddingStore";
    import { mmrStore, mmrCandidatePoolStrategies } from "$lib/stores/mmrStore";
    import { embeddingApiTypeOptions } from "$lib/types/embeddings";
    import { authLogout, authStore } from "$lib/stores/authStore";
    import { pullGlobalSettings, recalculateSimilarCache, clearCompressedImages, buildUniquenessIndex } from "$lib/requests/settingRequests";
    import { startExtradataRecalc, watchOperation } from "$lib/requests/operationRequests";
    import { hasRunningOperation, operationStore } from "$lib/stores/operationStore";
    import { deleteTagFromImages } from "$lib/requests/tagRequests";
    import {
        removeTagDefinition,
        reorderTagDefinitionsByNames,
        tagsStore,
        upsertTagDefinition,
    } from "$lib/stores/tagsStore";
    import type { TagDefinition } from "$lib/types/tags";
    import SortableList from "$lib/components/SortableList.svelte";
    import DragHandle from "$lib/components/DragHandle.svelte";

    import {
        closeContextMenu,
        openContextMenu,
    } from "$lib/items/ContextMenuManager.svelte";

    let inputTimer: any;
    let address = $flyoutStore.url;
    let flyoutMode = $flyoutStore.mode;
    let flyoutContext = "";
    let flyoutHistoryLength = 5;
    let flyoutButtonPosition = $flyoutButtonTop ? "top" : "bottom";
    let llmOpen = false;
    let embeddingOpen = false;
    let customFiltersOpen = false;
    let selectedInstructionId = "";
    let instructionModalOpen = false;
    let editingInstruction: SystemInstruction | null = null;
    let modalInstructionName = "";
    let modalInstructionText = "";
    let filterModalOpen = false;
    let editingFilter: CustomFilter | null = null;
    let modalFilterName = "";
    let modalFilterText = "";
    let recalculatingSimilarCache = false;
    let buildingUniquenessIndex = false;
    let clearingCompressedImages = false;
    let keywordHelpOpen = false;
    let tagModalOpen = false;
    let editingTag: TagDefinition | null = null;
    let modalTagName = "";
    let modalTagColor = "#5b9cf5";
    let extradataRecalcStarting = false;
    let extradataRecalcController: AbortController | undefined;

    $: extradataRecalcRunning = extradataRecalcStarting || hasRunningOperation($operationStore, 'extradata-recalc');
    $: extradataRecalcOp = $operationStore.find(op => op.type === 'extradata-recalc' && op.status === 'running');

    $: {
        const instructions = $llmStore.systemInstructions;
        if (!instructions.some((item) => item.id === selectedInstructionId)) {
            selectedInstructionId = instructions[0]?.id ?? "";
        }
    }

    $: instructionOptions = $llmStore.systemInstructions.map((instruction) => ({
        value: instruction.id,
        label: instruction.name,
    }));

    const imageFlowOptions = [
        { value: "grid", label: "Grid" },
        { value: "masonry", label: "Masonry" },
    ] as const;

    const imageSpacingOptions = [
        { value: "classic", label: "Classic" },
        { value: "compact", label: "Compact" },
        { value: "mosaic", label: "Mosaic" },
    ] as const;

    $: setInput($flyoutStore.url);

    let refreshInterval: any = setInterval(() => {
        pullGlobalSettings();
    }, 1000);

    onDestroy(() => {
        clearTimeout(inputTimer);
        inputTimer = undefined;
        clearInterval(refreshInterval);
        refreshInterval = undefined;
        extradataRecalcController?.abort();
    });

    function setInput(value: string) {
        address = value;
    }

    function onInput() {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            closeContextMenu(flyoutContext);

            const old = $flyoutStore.url;
            if (address === old) return;

            flyoutStore.update((x) => ({ ...x, url: address }));

            flyoutHistory.update((history) => {
                history = history.filter(
                    (item) => item !== address && item !== old,
                );
                if (old) history.unshift(old);
                if (address && address !== old) history.unshift(address);
                return history.slice(0, flyoutHistoryLength + 1);
            });
            notify(`Flyout address set to '${address}'`);
        }, 2000);
    }

    function onFlyoutModeChange() {
        flyoutStore.update((x) => ({ ...x, mode: flyoutMode }));
    }

    function onFlyoutButtonPositionChange() {
        $flyoutButtonTop = flyoutButtonPosition === "top";
    }

    function reset() {
        notify(`LocalStorage was cleared`);
        localStorage.clear();
        window.location.reload();
    }

    function logout() {
        notify(`Logging out`);
        authLogout();
    }

    function flyoutFocus(e: FocusEvent) {
        setTimeout(() => {
            const rect = (e.target as Element).getBoundingClientRect();
            flyoutContext = openContextMenu(
                {
                    x: rect.left - 15,
                    y: rect.bottom,
                },
                $flyoutHistory
                    .filter((x) => x !== $flyoutStore.url)
                    .map((x) => ({
                        name: x,
                        handler() {
                            address = x;
                            const old = $flyoutStore.url;

                            flyoutStore.update((prev) => ({ ...prev, url: x }));

                            flyoutHistory.update((history) => {
                                history = history.filter(
                                    (item) => item !== x && item !== old,
                                );
                                if (old) history.unshift(old);
                                if (x !== old) history.unshift(x);
                                return history.slice(
                                    0,
                                    flyoutHistoryLength + 1,
                                );
                            });
                            notify(`Flyout address set to '${x}'`);
                        },
                    })),
            );
        }, 150);
    }

    function flyoutBlur() {
        // closeContextMenu(flyoutContext);
    }

    function openAddInstruction() {
        editingInstruction = null;
        modalInstructionName = "";
        modalInstructionText = "";
        instructionModalOpen = true;
    }

    function openEditInstruction() {
        const instruction = $llmStore.systemInstructions.find(
            (item) => item.id === selectedInstructionId,
        );
        if (!instruction) return;

        editingInstruction = instruction;
        modalInstructionName = instruction.name;
        modalInstructionText = instruction.text;
        instructionModalOpen = true;
    }

    function closeInstructionModal() {
        instructionModalOpen = false;
        editingInstruction = null;
    }

    function saveInstruction(event: CustomEvent<{ name: string; text: string }>) {
        const { name, text } = event.detail;

        if (editingInstruction) {
            llmStore.update((settings) => ({
                ...settings,
                systemInstructions: settings.systemInstructions.map((item) =>
                    item.id === editingInstruction!.id
                        ? { ...item, name, text }
                        : item,
                ),
            }));
            notify(`Updated instruction '${name}'`);
        } else {
            const id = crypto.randomUUID();
            llmStore.update((settings) => ({
                ...settings,
                systemInstructions: [
                    ...settings.systemInstructions,
                    { id, name, text },
                ],
            }));
            selectedInstructionId = id;
            notify(`Added instruction '${name}'`);
        }

        closeInstructionModal();
    }

    function openAddFilter() {
        editingFilter = null;
        modalFilterName = "";
        modalFilterText = "";
        filterModalOpen = true;
    }

    function openEditFilter(filter: CustomFilter) {
        editingFilter = filter;
        modalFilterName = filter.name;
        modalFilterText = filter.filter;
        filterModalOpen = true;
    }

    function closeFilterModal() {
        filterModalOpen = false;
        editingFilter = null;
    }

    function saveFilter(event: CustomEvent<{ name: string; filter: string }>) {
        const { name, filter } = event.detail;
        const duplicate = $customFiltersStore.filters.some(
            (item) =>
                item.name.toLowerCase() === name.toLowerCase() &&
                item.id !== editingFilter?.id,
        );
        if (duplicate) {
            notify(`Filter name '${name}' already exists`, "warn");
            return;
        }

        if (editingFilter) {
            customFiltersStore.update((state) => ({
                filters: state.filters.map((item) =>
                    item.id === editingFilter!.id
                        ? { ...item, name, filter }
                        : item,
                ),
            }));
            notify(`Updated filter '${name}'`);
        } else {
            const id = crypto.randomUUID();
            customFiltersStore.update((state) => ({
                filters: [...state.filters, { id, name, filter }],
            }));
            notify(`Added filter '${name}'`);
        }

        closeFilterModal();
    }

    async function deleteFilter(filter: CustomFilter) {
        const confirmed = await askConfirmation(
            "Delete filter",
            `Delete filter '${filter.name}'?`,
        );
        if (!confirmed) return;

        customFiltersStore.update((state) => ({
            filters: state.filters.filter((item) => item.id !== filter.id),
        }));
        activeCustomFilterIds.update((ids) => ids.filter((id) => id !== filter.id));
        notify(`Deleted filter '${filter.name}'`);
    }

    function onFiltersReorder(event: CustomEvent<{ ids: string[] }>) {
        customFiltersStore.update((state) =>
            reorderCustomFiltersByIds(state, event.detail.ids),
        );
    }

    function onTagsReorder(event: CustomEvent<{ ids: string[] }>) {
        tagsStore.update((state) =>
            reorderTagDefinitionsByNames(state, event.detail.ids),
        );
    }

    async function deleteInstruction() {
        const instruction = $llmStore.systemInstructions.find(
            (item) => item.id === selectedInstructionId,
        );
        if (!instruction) return;

        const confirmed = await askConfirmation(
            "Delete instruction",
            `Delete instruction '${instruction.name}'?`,
        );
        if (!confirmed) return;

        llmStore.update((settings) => ({
            ...settings,
            systemInstructions: settings.systemInstructions.filter(
                (item) => item.id !== selectedInstructionId,
            ),
        }));
        notify(`Deleted instruction '${instruction.name}'`);
    }

    function openAddTag() {
        editingTag = null;
        modalTagName = "";
        modalTagColor = "#5b9cf5";
        tagModalOpen = true;
    }

    function openEditTag(tag: TagDefinition) {
        editingTag = tag;
        modalTagName = tag.name;
        modalTagColor = tag.color;
        tagModalOpen = true;
    }

    function closeTagModal() {
        tagModalOpen = false;
        editingTag = null;
    }

    function saveTag(event: CustomEvent<{ name: string; color: string }>) {
        const { name, color } = event.detail;
        const duplicate = $tagsStore.tags.some(
            (item) => item.name.toLowerCase() === name.toLowerCase() && item.name !== editingTag?.name,
        );
        if (duplicate) {
            notify(`Tag name '${name}' already exists`, "warn");
            return;
        }

        if (editingTag && editingTag.name !== name) {
            notify("Rename tags from settings by deleting and re-adding", "warn");
            return;
        }

        tagsStore.update((state) => upsertTagDefinition(state, { name, color }));
        notify(editingTag ? `Updated tag '${name}'` : `Added tag '${name}'`);
        closeTagModal();
    }

    async function deleteTag(tag: TagDefinition) {
        const confirmed = await askConfirmation(
            "Delete tag",
            `Delete tag '${tag.name}' and remove it from all images?`,
        );
        if (!confirmed) return;

        try {
            const removedFrom = await deleteTagFromImages(tag.name);
            tagsStore.update((state) => removeTagDefinition(state, tag.name));
            notify(`Deleted tag '${tag.name}' (removed from ${removedFrom} images)`);
            closeTagModal();
        } catch (cause) {
            console.error(cause);
            notify(cause instanceof Error ? cause.message : "Failed to delete tag", "warn");
        }
    }

    const mmrCandidatePoolOptions = [
        { value: 'n-select', label: 'Even date sampling' },
        { value: 'index', label: 'Uniqueness index' },
        { value: 'pre-rank', label: 'Current-match uniqueness' },
    ] satisfies { value: typeof mmrCandidatePoolStrategies[number]; label: string }[];

    async function onBuildUniquenessIndex() {
        if (buildingUniquenessIndex)
            return;

        buildingUniquenessIndex = true;
        try {
            const result = await buildUniquenessIndex();
            notify(`Uniqueness index built for ${result.indexed} embedded images`);
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Failed to build uniqueness index', 'warn');
        } finally {
            buildingUniquenessIndex = false;
        }
    }

    async function onRecalculateSimilarCache() {
        if (recalculatingSimilarCache)
            return;

        recalculatingSimilarCache = true;
        try {
            const result = await recalculateSimilarCache({
                similarityAlgorithm: $similarityAlgorithm,
                similarityThreshold: $similarityThreshold,
            });
            notify(`Similarity cache recalculated (${result.poolSize}/${result.imageCount} images in pool)`);
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Failed to recalculate similarity cache');
        } finally {
            recalculatingSimilarCache = false;
        }
    }

    async function onRecalculateExtradata() {
        if (extradataRecalcRunning)
            return;

        const confirmed = await askConfirmation(
            'Recalculate extra data',
            'Rebuild derived prompt, model, and hash fields from stored metadata? Annotations are preserved. This may take a while for large libraries.',
        );
        if (!confirmed)
            return;

        extradataRecalcStarting = true;
        try {
            const operation = await startExtradataRecalc();
            if (!operation)
                throw new Error('Failed to start recalculation');
            void watchExtradataRecalc(operation.operationId);
            notify('Extra data recalculation started');
        } catch (e) {
            extradataRecalcStarting = false;
            notify(e instanceof Error ? e.message : 'Failed to start recalculation', 'error');
        }
    }

    async function watchExtradataRecalc(operationId: string) {
        extradataRecalcController?.abort();
        const controller = new AbortController();
        extradataRecalcController = controller;

        try {
            await watchOperation(operationId, operations => {
                extradataRecalcStarting = false;
                operationStore.set(operations);
            }, controller.signal);
        } catch (e) {
            if (!controller.signal.aborted)
                notify(e instanceof Error ? e.message : 'Extra data progress stream failed', 'error');
        } finally {
            if (extradataRecalcController === controller)
                extradataRecalcController = undefined;
            extradataRecalcStarting = false;
        }
    }

    async function onClearCompressedImages() {
        if (clearingCompressedImages)
            return;

        const confirmed = await askConfirmation(
            'Clear compressed images',
            'Delete all generated WebP cache files (medium, low, and minimal)? Original images are not affected. Cached previews will regenerate on demand.',
        );
        if (!confirmed)
            return;

        clearingCompressedImages = true;
        try {
            const result = await clearCompressedImages();
            notify(`Cleared ${result.deleted} compressed image${result.deleted === 1 ? '' : 's'}`);
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Failed to clear compressed images', 'warn');
        } finally {
            clearingCompressedImages = false;
        }
    }
</script>

<div class="settings">
    <div class="top">
        <h3>Settings</h3>
        <div class="top-actions">
            <Link class="ghost" to="/">← Back</Link>
            <button type="button" class="ghost danger" on:click={reset}>Reset</button>
            {#if $authStore.password}
                <button type="button" class="ghost" on:click={logout}>Logout</button>
            {/if}
        </div>
    </div>

    <div class="help-row">
        <div class="help-block">
            <strong>Keyboard shortcuts</strong>
            <div class="list">
                <span>Esc: Cancel</span>
                <span>Arrows: Browse images</span>
                <span>Space: toggle slideshow</span>
                <span>F: toggle flyout</span>
            </div>
        </div>

        <button
            type="button"
            class="help-block keyword-help-trigger"
            title="Open detailed search keyword help"
            on:click={() => (keywordHelpOpen = true)}
        >
            <strong>Search keywords</strong>
            <div class="list">
                <span>{searchKeywords.join(", ").replaceAll("|", " | ")}</span>
            </div>
        </button>
    </div>

    <div class="cards">
    <div class="settings-card">
        <h4>Flyout</h4>
        <label class="checkbox">
            Flyout enabled
            <input type="checkbox" bind:checked={$flyoutStore.enabled} />
        </label>

        <div class="wrapper" class:isOpen={$flyoutStore.enabled}>
            <div class="inner">
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label>
                    Address (webui url)
                    <Input
                        bind:value={address}
                        on:input={onInput}
                        on:focus={flyoutFocus}
                        on:blur={flyoutBlur}
                    />
                </label>

                <div class="select-field">
                    <span>Styling</span>
                    <Select
                        id="flyout-mode"
                        bind:value={flyoutMode}
                        options={flyoutModes}
                        on:change={onFlyoutModeChange}
                    />
                </div>

                <label class="checkbox">
                    Show button
                    <input type="checkbox" bind:checked={$flyoutButton} />
                </label>

                <div class="select-field">
                    <span>Button position</span>
                    <Select
                        id="flyout-button-position"
                        bind:value={flyoutButtonPosition}
                        options={["top", "bottom"]}
                        on:change={onFlyoutButtonPositionChange}
                    />
                </div>
            </div>
        </div>
    </div>

    <div class="settings-card">
        <h4>Visual</h4>
        <div class="settings-group visual-group">

        <label
            class="checkbox"
            title="Opens the full image view edge-to-edge."
        >
            Maximize fullscreen image size
            <input type="checkbox" bind:checked={$fullscreenStyle} />
        </label>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label
            class="inline"
            title="0 disables fade (instant swap); higher values smooth the reveal (nicer on slow networks)."
        >
            Image fade-in (ms)
            <NumInput bind:value={$imageFadeMs} />
        </label>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label
            class="inline"
            title="Adjusts thumbnail column width. Use pixels (e.g. -100) or a CSS length expression (e.g. 10vw + 50px). Negative values make thumbnails smaller; positive values make them larger."
        >
            Image grid size offset
            <Input
                bind:value={$imageSize}
                placeholder="-100 or 10vw + 50px"
            />
        </label>

        <div
            class="select-field"
            title="Classic: Standard grid spacing with rounded thumbnails.
Compact: Tightens the gallery grid with smaller gaps and padding.
Mosaic: No gaps or rounded corners; images meet edge to edge."
        >
            <span>Image spacing</span>
            <Select
                id="image-spacing"
                bind:value={$imageSpacing}
                options={imageSpacingOptions}
            />
        </div>

        <div
            class="select-field"
            title="Grid: Classic grid layout. Can leave gaps between images.
Masonry: Tile images by placing them in the shortest column, like a photo wall."
        >
            <span>Image flow</span>
            <Select
                id="image-flow"
                bind:value={$imageFlow}
                options={imageFlowOptions}
            />
        </div>
    </div>
    </div>

    <div class="settings-card">
        <h4>LLM / embeddings</h4>
    <div class="sgroup llm-settings">
        <button
            type="button"
            class="llm-summary"
            aria-expanded={llmOpen}
            on:click={() => (llmOpen = !llmOpen)}
        >
            LLM API settings
            <span class="chevron" class:open={llmOpen} aria-hidden="true" />
        </button>

        <div class="wrapper" class:isOpen={llmOpen}>
            <div class="inner llm-inner">
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label>
                    Base URL
                    <Input bind:value={$llmStore.baseUrl} placeholder="http://localhost:8000/v1" />
                </label>

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label>
                    API key (optional)
                    <Input password bind:value={$llmStore.apiKey} />
                </label>

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label>
                    Model ID
                    <Input bind:value={$llmStore.modelId} />
                </label>

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label class="inline">
                    Parallel API calls
                    <NumInput bind:value={$llmStore.parallelCalls} />
                </label>

                <div class="llm-subsection">
                    <span class="subsection-title">System instructions</span>

                    {#if $llmStore.systemInstructions.length}
                        <div class="select-field">
                            <span>Instruction</span>
                            <Select
                                id="saved-instruction"
                                bind:value={selectedInstructionId}
                                options={instructionOptions}
                            />
                        </div>
                    {/if}

                    <div class="instruction-buttons">
                        {#if $llmStore.systemInstructions.length}
                            <Button
                                disabled={!selectedInstructionId}
                                on:click={openEditInstruction}
                            >
                                Modify
                            </Button>
                            <Button
                                disabled={!selectedInstructionId}
                                on:click={deleteInstruction}
                            >
                                Delete
                            </Button>
                        {/if}
                        <Button on:click={openAddInstruction}>Add new</Button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="sgroup llm-settings">
        <button
            type="button"
            class="llm-summary"
            aria-expanded={embeddingOpen}
            on:click={() => (embeddingOpen = !embeddingOpen)}
        >
            Embedding settings
            <span class="chevron" class:open={embeddingOpen} aria-hidden="true" />
        </button>

        <div class="wrapper" class:isOpen={embeddingOpen}>
            <div class="inner llm-inner">
                {#if $embeddingStore.apiType === "llama-cpp"}
                    <p class="embedding-warning">
                        Requires an embedding API with multimodal support (image + text), such as llama.cpp with a vision model.
                    </p>
                {:else}
                    <p class="embedding-warning">
                        Requires an sv-embed server with multimodal support (image + text).
                    </p>
                {/if}

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="select-field">
                    <span>API type</span>
                    <Select
                        id="embedding-api-type"
                        bind:value={$embeddingStore.apiType}
                        options={embeddingApiTypeOptions}
                    />
                </div>

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label>
                    Base URL
                    <Input
                        bind:value={$embeddingStore.baseUrl}
                        placeholder={$embeddingStore.apiType === "sv-embed" ? "http://localhost:8000" : "http://localhost:8080"}
                    />
                </label>

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label>
                    API key (optional)
                    <Input password bind:value={$embeddingStore.apiKey} />
                </label>

                {#if $embeddingStore.apiType === "llama-cpp"}
                    <!-- svelte-ignore a11y-label-has-associated-control -->
                    <label>
                        Model ID
                        <Input bind:value={$embeddingStore.modelId} />
                    </label>
                {/if}

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label class="inline">
                    Batch size
                    <NumInput bind:value={$embeddingStore.apiBatch} />
                </label>

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label>
                    Search template
                    <Input
                        bind:value={$embeddingStore.searchTemplate}
                        placeholder={'This is a photo of {label}.'}
                    />
                </label>

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label class="inline">
                    Image similarity threshold
                    <NumInput bind:value={$embeddingStore.imageSimilarityThreshold} />
                </label>

                <p class="embedding-section-title">MMR search</p>

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="select-field">
                    <span>MMR candidate pool strategy</span>
                    <Select
                        id="mmr-candidate-pool"
                        bind:value={$mmrStore.candidatePoolStrategy}
                        options={mmrCandidatePoolOptions}
                    />
                </div>

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label
                    class="inline"
                    title="Blend weight for MMR: higher values favor intrinsic uniqueness, lower values favor diversity from already selected images."
                >
                    MMR diversity weight (0–1)
                    <NumInput bind:value={$mmrStore.diversityWeight} step="any" />
                </label>

                <div class="similar-cache-action">
                    <Button on:click={onBuildUniquenessIndex}>
                        {buildingUniquenessIndex ? 'Building...' : 'Build uniqueness index'}
                    </Button>
                </div>
                <p class="hint">
                    Builds the optional full-library uniqueness index used by MMR with the <code>index</code> candidate strategy. Rebuild manually after embeddings change.
                </p>
            </div>
        </div>
    </div>
    </div>

    {#if instructionModalOpen}
        <SystemInstructionModal
            title={editingInstruction ? "Modify instruction" : "Add instruction"}
            bind:name={modalInstructionName}
            bind:text={modalInstructionText}
            on:save={saveInstruction}
            on:close={closeInstructionModal}
        />
    {/if}

    {#if filterModalOpen}
        <CustomFilterModal
            title={editingFilter ? "Modify filter" : "Add filter"}
            bind:name={modalFilterName}
            bind:filter={modalFilterText}
            on:save={saveFilter}
            on:close={closeFilterModal}
        />
    {/if}

    {#if tagModalOpen}
        <TagModal
            title={editingTag ? "Modify tag" : "Add tag"}
            bind:name={modalTagName}
            bind:color={modalTagColor}
            canDelete={!!editingTag}
            on:save={saveTag}
            on:delete={() => editingTag && deleteTag(editingTag)}
            on:close={closeTagModal}
        />
    {/if}

    {#if keywordHelpOpen}
        <SearchKeywordHelpModal on:close={() => (keywordHelpOpen = false)} />
    {/if}

    <div class="settings-card">
        <h4>Tags &amp; filters</h4>
    <div class="tags-inline">
        <span class="subsection-title">Tags</span>
        <TagPillRow
            tags={$tagsStore.tags.map((tag) => tag.name)}
            showAdd
            clickable
            compact
            sortable
            on:add={openAddTag}
            on:reorder={onTagsReorder}
            on:edit={(event) => {
                const tag = $tagsStore.tags.find((item) => item.name === event.detail);
                if (tag) openEditTag(tag);
            }}
        />
    </div>

    <div class="sgroup llm-settings custom-filters-section">
        <button
            type="button"
            class="llm-summary"
            aria-expanded={customFiltersOpen}
            on:click={() => (customFiltersOpen = !customFiltersOpen)}
        >
            Custom Filters
            <span class="chevron" class:open={customFiltersOpen} aria-hidden="true" />
        </button>

        <div class="wrapper" class:isOpen={customFiltersOpen}>
            <div class="inner llm-inner custom-filters-inner">
                {#if $customFiltersStore.filters.length}
                    <div class="filter-list">
                        <SortableList
                            ids={$customFiltersStore.filters.map((filter) => filter.id)}
                            axis="y"
                            role="list"
                            on:reorder={onFiltersReorder}
                            let:id
                            let:startDrag
                        >
                            {@const filter = $customFiltersStore.filters.find((item) => item.id === id)}
                            {#if filter}
                                <div class="filter-card">
                                    <div class="filter-header">
                                        <DragHandle
                                            label="Drag to reorder {filter.name}"
                                            on:pointerdown={startDrag}
                                        />
                                        <span class="filter-name">{filter.name}</span>
                                        <div class="filter-actions">
                                            <button
                                                type="button"
                                                class="filter-edit"
                                                on:click={() => openEditFilter(filter)}
                                            >
                                                edit
                                            </button>
                                            <button
                                                type="button"
                                                class="filter-delete"
                                                aria-label="Delete filter {filter.name}"
                                                on:click={() => deleteFilter(filter)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                    <code class="filter-expression" title={filter.filter}
                                        >{filter.filter}</code
                                    >
                                </div>
                            {/if}
                        </SortableList>
                    </div>
                {/if}

                <div class="inline-action">
                    <Button on:click={openAddFilter}>Add filter</Button>
                </div>
            </div>
        </div>
    </div>
    </div>

    <div class="settings-card">
        <h4>Search defaults</h4>
    <div class="settings-group">
        <label class="checkbox">
            Show NSFW filter
            <input type="checkbox" bind:checked={$showNsfwFilter} />
        </label>

        {#if $showNsfwFilter}
            <!-- svelte-ignore a11y-label-has-associated-control -->
            <label>
                NSFW filter
                <span class="gray">
                    (Added to the search when NSFW toggle is disabled)
                </span>
                <Input bind:value={$nsfwFilter} />
            </label>
        {/if}

        <div class="select-field">
            <span>Matching</span>
            <Select id="matching" bind:value={$matchingMode} options={searchModes} />
        </div>

        <div class="select-field">
            <span>Similarity algorithm</span>
            <Select
                id="similarityAlgorithm"
                bind:value={$similarityAlgorithm}
                options={similarityAlgorithms}
            />
        </div>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label
            class="inline"
            title="Prompt similarity cutoff (0–1) for similar exploration. Images are included when their prompt similarity to the previous selection is below this value. Lower values keep only more distinct images; higher values allow more similar prompts."
        >
            Similarity threshold
            <NumInput bind:value={$similarityThreshold} step="any" />
        </label>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label class="inline">
            Sparse frequency (every Nth image)
            <NumInput bind:value={$sparseFrequency} />
        </label>

        <div class="similar-cache-action">
            <Button on:click={onRecalculateSimilarCache}>
                {recalculatingSimilarCache ? 'Recalculating...' : 'Recalculate similarity cache'}
            </Button>
        </div>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label class="inline">
            Slideshow interval (milliseconds)
            <NumInput bind:value={$slideDelay} />
        </label>
    </div>
    </div>

    <div class="settings-card">
        <h4>Image quality</h4>
    <div class="settings-group">
        <p class="gray quality-hint">
            When using locally, recommended to use original and low
            <br />
            When using remotely, recommended to use medium and low for faster loading
            <br />
            Use minimal for the smallest cached previews (230px)
            <br />
            Setting thumbnails to low allows for smoother scrolling even locally
            <br />
            * medium, low, and minimal are slightly slower when seeing an image for the first time
        </p>

        <div class="select-field">
            <span>Full size quality</span>
            <Select id="fullimage" bind:value={$compressedMode} options={qualityModes} />
        </div>

        <div class="select-field">
            <span>Thumbnail quality</span>
            <Select id="thumbnail" bind:value={$thumbMode} options={qualityModes} />
        </div>

        <label class="checkbox">
            Animate thumbnail for videos
            <input type="checkbox" bind:checked={$animatedThumb} />
        </label>

        <label class="checkbox">
            Use smart subsampling
            <span class="gray">(disabling makes compression faster)</span>
            <input type="checkbox" bind:checked={$useSmartSubsampling} />
        </label>

        <div class="inline-action">
            <Button disabled={clearingCompressedImages} on:click={onClearCompressedImages}>
                {clearingCompressedImages ? 'Clearing...' : 'Clear compressed images'}
            </Button>
        </div>
    </div>
    </div>

    <div class="settings-card">
        <h4>PWA</h4>
    <div class="settings-group">
        <p class="gray">
            Enable this setting before adding to homescreen to disable mobile UI elements
            <br />
            Results depend on browser support (status bar, taskbar on tablets)
        </p>

        <label class="checkbox">
            PWA fullscreen
            <input type="checkbox" bind:checked={$fullscreenState} />
        </label>
    </div>
    </div>

    <div class="settings-card">
        <h4>Maintenance</h4>
    <div class="sgroup maintenance-group">
        <p class="gray">
            Rebuild derived prompt, model, and hash fields from stored metadata.
            Annotations and tags are preserved.
        </p>
        <div class="inline-action">
            <Button disabled={extradataRecalcRunning} on:click={onRecalculateExtradata}>
                {extradataRecalcRunning ? 'Recalculating...' : 'Recalculate extra data'}
            </Button>
        </div>
        {#if extradataRecalcOp}
            <p class="gray progress-detail">{extradataRecalcOp.done} / {extradataRecalcOp.total}</p>
        {/if}
    </div>
    </div>
    </div>
</div>

<style lang="scss">
    .settings {
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        padding: var(--main-padding);
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 1rem;
        background:
            radial-gradient(ellipse 70% 40% at 50% 0%, rgba(196, 165, 116, 0.07), transparent 55%),
            var(--bg);
        min-height: 100%;
    }

    .top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;

        h3 {
            margin: 0;
            font-size: 1.35rem;
            font-weight: 600;
            color: var(--ink);
        }
    }

    .top-actions {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
    }

    :global(a.ghost),
    .ghost {
        border: none;
        background: rgba(255, 255, 255, 0.03);
        color: var(--ink);
        border-radius: 999px;
        padding: 0.4rem 0.85rem;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        appearance: none;
        line-height: 1.2;
        transition: background-color 0.12s ease;

        &:hover,
        &:focus-visible {
            background: rgba(255, 255, 255, 0.1);
        }

        &.danger {
            color: var(--danger);

            &:hover,
            &:focus-visible {
                background: rgba(196, 122, 106, 0.16);
            }
        }
    }

    .cards {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem;

        @media (width < 700px) {
            grid-template-columns: 1fr;
        }
    }

    .settings-card {
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 0.85rem 0.95rem;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        min-width: 0;

        h4 {
            margin: 0 0 0.35rem;
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--accent);
            letter-spacing: 0.02em;
        }
    }

    .settings-group,
    .sgroup,
    .tags-inline {
        width: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
    }

    .sgroup,
    .maintenance-group {
        --gap: 6px;
        outline: none;
        border-radius: 0;
        padding: 0;
        margin: 0;
    }

    .gray {
        font-size: 0.8em;
        color: var(--muted);
        margin: 0;
    }

    .help-row {
        width: 100%;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
        align-items: stretch;

        @media (width < 700px) {
            grid-template-columns: 1fr;
        }
    }

    .help-block {
        width: 100%;
        box-sizing: border-box;
        overflow-wrap: break-word;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.03);
        border-radius: 14px;
        padding: 0.75rem 0.85rem;
        font-size: 0.78rem;
        color: var(--muted);
        text-align: left;

        strong {
            display: block;
            color: var(--ink);
            font-weight: 600;
            margin-bottom: 0.35rem;
        }

        .list {
            display: grid;
            gap: 0.15rem;
            color: var(--muted);
            font-size: inherit;
            font-family: inherit;
            font-weight: inherit;
            line-height: 1.45;
            word-break: break-word;
        }
    }

    .keyword-help-trigger {
        cursor: pointer;
        appearance: none;
        margin: 0;
        font-family: inherit;
        font-size: 0.78rem;
        line-height: inherit;
        color: inherit;

        &:hover,
        &:focus-visible {
            color: var(--ink);
        }

        &:focus {
            outline: none;
        }

        &:focus-visible {
            outline: 1px solid rgba(196, 165, 116, 0.45);
            outline-offset: 3px;
        }
    }

    .similar-cache-action {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5em;
    }

    .inline-action {
        align-self: flex-start;
    }

    .tags-inline {
        .subsection-title {
            color: var(--accent);
            font-weight: 600;
            font-size: 0.8rem;
        }
    }

    .llm-settings {
        gap: 0;

        .llm-summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            margin: 0;
            padding: 0;
            border: none;
            background: none;
            color: inherit;
            font: inherit;
            cursor: pointer;
            user-select: none;
            text-align: left;
        }

        .chevron {
            flex-shrink: 0;
            width: 0.45em;
            height: 0.45em;
            margin-left: 1em;
            border-right: 2px solid var(--muted);
            border-bottom: 2px solid var(--muted);
            transform: rotate(-45deg);
            transition: transform 0.5s ease;

            &.open {
                transform: rotate(45deg);
            }
        }

        .llm-inner {
            display: flex;
            flex-direction: column;
            gap: var(--gap);
        }

        .hint-inline {
            margin: 0;
            font-size: 0.85em;
            color: var(--muted);
            line-height: 1.4;
        }

        .embedding-warning {
            margin: 0;
            font-size: 0.9em;
            color: #d4a870;
            line-height: 1.4;
        }

        .embedding-section-title {
            margin: 0.5rem 0 0;
            font-weight: 600;
        }

        .hint {
            margin: 0;
            font-size: 0.85em;
            color: var(--muted);
            line-height: 1.4;
        }

        .llm-subsection {
            display: flex;
            flex-direction: column;
            gap: var(--gap);
            border-top: 1px solid var(--line);
            padding-top: var(--gap);
        }

        .subsection-title {
            color: var(--accent);
            font-weight: 600;
        }

        .instruction-buttons {
            display: flex;
            gap: 1em;
            flex-wrap: wrap;
        }

        .custom-filters-inner {
            gap: 0.75em;
        }

        .filter-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0.5em;

            :global(.sortable-list) {
                gap: 0.5em;
                width: 100%;
            }
        }

        .filter-card {
            display: flex;
            flex-direction: column;
            gap: 0.3em;
            padding: 0.35em 0.45em;
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.18);
            border: 1px solid var(--line);
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }

        .filter-header {
            display: flex;
            align-items: center;
            gap: 0.35em;
            min-width: 0;
        }

        .filter-name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            line-height: 1.4;
        }

        .filter-actions {
            display: flex;
            align-items: center;
            gap: 0.15em;
            flex-shrink: 0;
        }

        .filter-edit,
        .filter-delete {
            appearance: none;
            border: none;
            background: none;
            margin: 0;
            padding: 0;
            font: inherit;
            line-height: 1;
            cursor: pointer;
            color: var(--muted);
            transition: color 0.15s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 1.5em;
            box-sizing: border-box;

            &:focus {
                outline: none;
            }

            &:focus-visible {
                outline: 1px solid rgba(196, 165, 116, 0.45);
                outline-offset: 2px;
            }
        }

        .filter-edit {
            font-size: 0.85em;
            padding: 0 0.35em;

            &:hover {
                color: var(--accent);
            }
        }

        .filter-delete {
            font-size: 1.1em;
            width: 1.5em;
            padding: 0;

            &:hover {
                color: var(--danger);
            }
        }

        .filter-expression {
            display: block;
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas,
                monospace;
            font-size: 0.8em;
            color: var(--muted);
            background: rgba(0, 0, 0, 0.22);
            border-radius: 6px;
            padding: 0.35em 0.5em;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .wrapper {
            margin-top: 0;

            &.isOpen {
                margin-top: var(--gap);
            }
        }
    }

    .wrapper {
        display: grid;
        grid-template-rows: 0fr;
        transition:
            grid-template-rows 0.5s ease,
            margin-top 0.5s ease;
        margin-top: calc(0px - var(--gap));

        &.isOpen {
            position: relative;
            grid-template-rows: 1fr;
            margin-top: 0px;
        }

        .inner {
            display: flex;
            flex-direction: column;
            gap: var(--gap);
            overflow: hidden;
            padding: 0;
            margin: 0;

            & > :first-child {
                border-top: 1px solid var(--line);
                padding-top: var(--gap);
            }
        }
    }

    .list {
        display: flex;
        gap: 2em;
    }

    label {
        cursor: pointer;
        user-select: none;
        width: 100%;
        box-sizing: border-box;
        font-size: 0.8rem;
        color: var(--muted);
        padding: 0.45rem 0;
        border-bottom: 1px solid var(--line);

        &:last-child {
            border-bottom: none;
        }

        &:not(.checkbox):not(.inline) {
            display: flex;
            flex-direction: column;
            gap: 0.25em;
        }

        &.checkbox,
        &.inline {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            width: auto;
        }

        &.inline :global(.num) {
            flex: 0 0 auto;
            width: auto;
            max-width: 9rem;
        }

        &.inline :global(.input) {
            flex: 0 1 auto;
            width: auto;
            max-width: 11rem;
            min-width: 5.5rem;
        }
    }

    .select-field {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        user-select: none;
        width: 100%;
        box-sizing: border-box;
        font-size: 0.8rem;
        color: var(--muted);
        padding: 0.45rem 0;
        border-bottom: 1px solid var(--line);

        &:last-child {
            border-bottom: none;
        }

        span {
            flex-shrink: 0;
        }

        :global(.select) {
            flex: 0 0 auto;
            width: auto;
            max-width: none;
            margin-left: auto;
            justify-content: flex-end;
        }
    }

    input[type="checkbox"] {
        appearance: none;
        width: 2.2rem;
        height: 1.2rem;
        margin: 0;
        padding: 0;
        border-radius: 999px;
        border: none;
        background: #2a2420;
        cursor: pointer;
        position: relative;
        flex-shrink: 0;
        outline: none;
        transition: background-color 0.18s ease;

        &::before {
            content: "";
            position: absolute;
            top: 2px;
            left: 2px;
            width: 0.9rem;
            height: 0.9rem;
            border-radius: 50%;
            background: #f0e6d8;
            transform: translateX(0);
            transition: transform 0.18s ease, background-color 0.18s ease;
        }

        &:checked {
            background: rgba(196, 165, 116, 0.35);
        }

        &:checked::before {
            transform: translateX(calc(2.2rem - 0.9rem - 4px));
            background: var(--accent);
        }

        &:focus-visible {
            outline: 1px solid rgba(196, 165, 116, 0.45);
            outline-offset: 2px;
        }
    }
</style>
