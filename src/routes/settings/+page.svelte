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
        initialImages,
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
        fullscreenStyle,
        imageFlow,
        imageSize,
        imageSpacing,
    } from "$lib/stores/styleStore";
    import NumInput from "$lib/items/NumInput.svelte";
    import SystemInstructionModal from "$lib/components/SystemInstructionModal.svelte";
    import CustomFilterModal from "$lib/components/CustomFilterModal.svelte";
    import TagModal from "$lib/components/TagModal.svelte";
    import TagPillRow from "$lib/components/TagPillRow.svelte";
    import { askConfirmation } from "$lib/components/Confirm.svelte";
    import {
        llmStore,
        type SystemInstruction,
    } from "$lib/stores/llmStore";
    import { embeddingStore } from "$lib/stores/embeddingStore";
    import { embeddingApiTypeOptions } from "$lib/types/embeddings";
    import { authLogout, authStore } from "$lib/stores/authStore";
    import { pullGlobalSettings, recalculateSimilarCache, clearCompressedImages } from "$lib/requests/settingRequests";
    import { startExtradataRecalc, getOperations } from "$lib/requests/operationRequests";
    import { hasRunningOperation, operationStore } from "$lib/stores/operationStore";
    import { deleteTagFromImages } from "$lib/requests/tagRequests";
    import {
        removeTagDefinition,
        tagsStore,
        upsertTagDefinition,
    } from "$lib/stores/tagsStore";
    import type { TagDefinition } from "$lib/types/tags";

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
    let clearingCompressedImages = false;
    let tagModalOpen = false;
    let editingTag: TagDefinition | null = null;
    let modalTagName = "";
    let modalTagColor = "#5b9cf5";

    $: extradataRecalcRunning = hasRunningOperation($operationStore, 'extradata-recalc');
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

        try {
            await startExtradataRecalc();
            operationStore.set(await getOperations());
            notify('Extra data recalculation started');
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Failed to start recalculation', 'error');
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

<div class="container">
    <div class="buttons">
        <Link to="/">Back</Link>
        <Button on:click={reset}>Reset</Button>
        {#if $authStore.password}
            <Button on:click={logout}>Logout</Button>
        {/if}
    </div>

    <div class="help-row">
        <div class="gray help-block">
            Keyboard shortcuts:<br />
            <div class="list">
                <span>Esc: Cancel</span>
                <span>Arrows: Browse images</span>
                <span>Space: toggle slideshow</span>
                <span>F: toggle flyout</span>
            </div>
        </div>

        <div class="gray help-block">
            Search keywords:<br /><span>
                {searchKeywords.join(", ").replaceAll("|", " | ")}
            </span>
        </div>
    </div>

    <div class="sgroup">
        <label class="checkbox">
            Flyout enabled:
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

                <label for="flyout-mode">
                    Styling:
                    <Select
                        id="flyout-mode"
                        bind:value={flyoutMode}
                        options={flyoutModes}
                        on:change={onFlyoutModeChange}
                    />
                </label>

                <label class="checkbox">
                    Show button:
                    <input type="checkbox" bind:checked={$flyoutButton} />
                </label>

                <label for="flyout-button-position">
                    Button position:
                    <Select
                        id="flyout-button-position"
                        bind:value={flyoutButtonPosition}
                        options={["top", "bottom"]}
                        on:change={onFlyoutButtonPositionChange}
                    />
                </label>
            </div>
        </div>
    </div>

    <div class="settings-group">
        <span class="gray"> Visual style settings </span>

        <label
            class="checkbox"
            title="Opens the full image view edge-to-edge."
        >
            Maximize fullscreen image size:
            <input type="checkbox" bind:checked={$fullscreenStyle} />
        </label>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label
            title="Adjusts thumbnail column width. Use pixels (e.g. -100) or a CSS length expression (e.g. 10vw + 50px). Negative values make thumbnails smaller; positive values make them larger."
        >
            Image grid size offset:
            <Input
                bind:value={$imageSize}
                placeholder="-100 (pixels) or 10vw + 50px"
            />
        </label>

        <label
            for="image-spacing"
            title="Classic: Standard grid spacing with rounded thumbnails.
Compact: Tightens the gallery grid with smaller gaps and padding.
Mosaic: No gaps or rounded corners; images meet edge to edge."
        >
            Image spacing:
            <Select
                id="image-spacing"
                bind:value={$imageSpacing}
                options={imageSpacingOptions}
            />
        </label>

        <label
            for="image-flow"
            title="Grid: Classic grid layout. Can leave gaps between images.
Masonry: Tile images by placing them in the shortest column, like a photo wall."
        >
            Image flow:
            <Select
                id="image-flow"
                bind:value={$imageFlow}
                options={imageFlowOptions}
            />
        </label>
    </div>

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
                <label>
                    Parallel API calls
                    <NumInput bind:value={$llmStore.parallelCalls} />
                </label>

                <div class="llm-subsection">
                    <span class="subsection-title">System instructions</span>

                    {#if $llmStore.systemInstructions.length}
                        <label for="saved-instruction">
                            Instruction:
                            <Select
                                id="saved-instruction"
                                bind:value={selectedInstructionId}
                                options={instructionOptions}
                            />
                        </label>
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
                <label for="embedding-api-type">
                    API type:
                    <Select
                        id="embedding-api-type"
                        bind:value={$embeddingStore.apiType}
                        options={embeddingApiTypeOptions}
                    />
                </label>

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
                <label>
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

                <label
                    class="checkbox"
                    title="Uses sqlite-vec KNN for IMG search without an explicit k (max 4096). Explicit k ≤ 4096 always uses vec KNN; larger k uses JS similarity."
                >
                    Use optimized embedding query (results limited to max 4096):
                    <input type="checkbox" bind:checked={$embeddingStore.useOptimizedEmbeddingQuery} />
                </label>
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

    <div class="tags-inline">
        <span class="subsection-title">Tags</span>
        <TagPillRow
            tags={$tagsStore.tags.map((tag) => tag.name)}
            showAdd
            clickable
            compact
            on:add={openAddTag}
            on:edit={(event) => {
                const tag = $tagsStore.tags.find((item) => item.name === event.detail);
                if (tag) openEditTag(tag);
            }}
        />
    </div>

    <div class="sgroup llm-settings">
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
                    <ul class="filter-list">
                        {#each $customFiltersStore.filters as filter (filter.id)}
                            <li class="filter-card">
                                <div class="filter-header">
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
                            </li>
                        {/each}
                    </ul>
                {/if}

                <div class="inline-action">
                    <Button on:click={openAddFilter}>Add filter</Button>
                </div>
            </div>
        </div>
    </div>

    <div class="settings-group">
        <label class="checkbox">
            Show NSFW filter:
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

        <label for="matching">
            Matching:
            <Select id="matching" bind:value={$matchingMode} options={searchModes} />
        </label>

        <label for="similarityAlgorithm">
            Similarity algorithm:
            <Select
                id="similarityAlgorithm"
                bind:value={$similarityAlgorithm}
                options={similarityAlgorithms}
            />
        </label>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label
            title="Prompt similarity cutoff (0–1) for similar exploration. Images are included when their prompt similarity to the previous selection is below this value. Lower values keep only more distinct images; higher values allow more similar prompts."
        >
            Similarity threshold
            <NumInput bind:value={$similarityThreshold} step="any" />
        </label>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label>
            Sparse frequency (every Nth image)
            <NumInput bind:value={$sparseFrequency} />
        </label>

        <div class="similar-cache-action">
            <Button on:click={onRecalculateSimilarCache}>
                {recalculatingSimilarCache ? 'Recalculating...' : 'Recalculate similarity cache'}
            </Button>
        </div>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label>
            Initial amount of images loaded (default: 500)
            <NumInput bind:value={$initialImages} />
        </label>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label>
            Slideshow interval (milliseconds)
            <NumInput bind:value={$slideDelay} />
        </label>
    </div>

    <div class="settings-group">
        <span class="gray">
            Image quality settings:
            <br />
            When using locally, recommended to use original and low
            <br />
            When using remotely, recommended to use medium and low for faster loading
            <br />
            Use minimal for the smallest cached previews (230px)
            <br />
            Setting thumbnails to low allows for smoother scrolling even locally
            <br />
            * medium, low, and minimal are slightly slower when seeing an image for the first time
        </span>

        <label for="fullimage">
            Full size quality:
            <Select id="fullimage" bind:value={$compressedMode} options={qualityModes} />
        </label>

        <label for="thumbnail">
            Thumbnail quality:
            <Select id="thumbnail" bind:value={$thumbMode} options={qualityModes} />
        </label>

        <label class="checkbox">
            Animate thumbnail for videos:
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

    <div class="settings-group">
        <span class="gray">
            PWA fullscreen:
            <br />
            Enable this setting before adding to homescreen to disable mobile UI elements
            <br />
            Results depend on browser support (status bar, taskbar on tablets)
        </span>

        <label class="checkbox">
            PWA fullscreen:
            <input type="checkbox" bind:checked={$fullscreenState} />
        </label>
    </div>

    <div class="sgroup">
        <span class="subsection-title">Data management</span>
        <span class="gray">
            Rebuild derived prompt, model, and hash fields from stored metadata.
            Annotations and tags are preserved.
        </span>
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

<style lang="scss">
    .container {
        padding: var(--main-padding);
        display: flex;
        flex-direction: column;
        gap: 1.5em;
    }

    .settings-group {
        display: flex;
        flex-direction: column;
        gap: 0.75em;
    }

    .buttons :global(.disabled) {
        opacity: 0.5;
        filter: grayscale(1);
    }

    .gray {
        font-size: 0.8em;
        color: #aaa;
    }

    .help-row {
        display: flex;
        flex-wrap: wrap;
        column-gap: 2em;
        row-gap: 1em;
        align-items: flex-start;
    }

    .help-block {
        flex: 0 0 auto;
    }

    .help-block + .help-block {
        flex: 1 1 auto;
        min-width: min(100%, 50%);
        max-width: 100%;
        overflow-wrap: break-word;
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
        display: flex;
        flex-direction: column;
        gap: 0.5em;

        .subsection-title {
            color: #ccc;
        }
    }

    .sgroup {
        --gap: 6px;
        display: flex;
        flex-direction: column;
        gap: var(--gap);
        // border: 1px solid #aaaa;
        outline: solid 1px #aaa4;
        outline-offset: 10px;
        border-radius: 5px;
        padding: 10px;
        margin-block: 0.75em;
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
            border-right: 2px solid #ccc;
            border-bottom: 2px solid #ccc;
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
            color: #aaa;
            line-height: 1.4;
        }

        .embedding-warning {
            margin: 0;
            font-size: 0.9em;
            color: #e8a060;
            line-height: 1.4;
        }

        .llm-subsection {
            display: flex;
            flex-direction: column;
            gap: var(--gap);
            border-top: dashed 1px #aaa4;
            padding-top: var(--gap);
        }

        .subsection-title {
            color: #ccc;
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
        }

        .filter-card {
            display: flex;
            flex-direction: column;
            gap: 0.3em;
            padding: 0.2em 0.4em 0.4em 0.4em;
            border-radius: 4px;
            background: #ffffff06;
            border: 1px solid #aaa2;
            min-width: 0;
        }

        .filter-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5em;
            min-width: 0;
            padding-left: 0.2em;
        }

        .filter-name {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
            padding: 0;
            font: inherit;
            line-height: 1;
            cursor: pointer;
            color: #888;
            transition: color 0.15s ease;

            &:focus {
                outline: none;
            }

            &:focus-visible {
                outline: 1px solid rgb(63, 187, 236);
                outline-offset: 2px;
            }
        }

        .filter-edit {
            font-size: 0.85em;
            padding: 0.15em 0.35em;

            &:hover {
                color: rgb(63, 187, 236);
            }
        }

        .filter-delete {
            font-size: 1.15em;
            padding: 0.1em 0.25em;

            &:hover {
                color: #e55;
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
            color: #aaa;
            background: #00000033;
            border-radius: 3px;
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
                border-top: dashed 1px #aaa4;
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

        &.checkbox {
            display: flex;
            align-items: center;
            gap: 0.5em;
        }
    }

    input[type="checkbox"] {
        appearance: none;
        background-color: #333;
        border-radius: 0.2em;
        font-size: 1em;
        width: 13px;
        height: 13px;
        margin: 0;
        padding: 0;
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
