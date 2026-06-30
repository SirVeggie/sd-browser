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
        imageSize,
        masonryLayout,
        seamlessStyle,
    } from "$lib/stores/styleStore";
    import NumInput from "$lib/items/NumInput.svelte";
    import SystemInstructionModal from "$lib/components/SystemInstructionModal.svelte";
    import CustomFilterModal from "$lib/components/CustomFilterModal.svelte";
    import { askConfirmation } from "$lib/components/Confirm.svelte";
    import {
        llmStore,
        type SystemInstruction,
    } from "$lib/stores/llmStore";
    import { authLogout, authStore } from "$lib/stores/authStore";
    import { pullGlobalSettings, recalculateSimilarCache } from "$lib/requests/settingRequests";
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

    function truncateFilter(text: string, max = 60): string {
        if (text.length <= max) return text;
        return `${text.slice(0, max)}…`;
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
</script>

<div class="container">
    <div class="buttons">
        <Link to="/">Back</Link>
        <Button on:click={reset}>Reset</Button>
        {#if $authStore.password}
            <Button on:click={logout}>Logout</Button>
        {/if}
    </div>

    <div class="gray">
        Keyboard shortcuts:<br />
        <div class="list">
            <span>Esc: Cancel</span>
            <span>Arrows: Browse images</span>
            <span>Space: toggle slideshow</span>
            <span>F: toggle flyout</span>
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
                        <div class="instruction-controls">
                            <label for="saved-instruction">
                                Saved instructions
                                <Select
                                    id="saved-instruction"
                                    bind:value={selectedInstructionId}
                                    options={instructionOptions}
                                />
                            </label>

                            <div class="instruction-buttons">
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
                            </div>
                        </div>
                    {/if}

                    <Button on:click={openAddInstruction}>Add instruction</Button>
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

    <div class="gray">
        Search keywords:<br /><span>
            {searchKeywords.join(", ").replaceAll("|", " | ")}
        </span>
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
            <div class="inner llm-inner">
                <span class="gray subsection-title">
                    Named filter expressions applied from the image page multi-select.
                </span>

                {#if $customFiltersStore.filters.length}
                    <ul class="filter-list">
                        {#each $customFiltersStore.filters as filter (filter.id)}
                            <li class="filter-row">
                                <div class="filter-info">
                                    <span class="filter-name">{filter.name}</span>
                                    <span class="filter-preview gray"
                                        >{truncateFilter(filter.filter)}</span
                                    >
                                </div>
                                <div class="filter-buttons">
                                    <Button on:click={() => openEditFilter(filter)}>
                                        Edit
                                    </Button>
                                    <Button on:click={() => deleteFilter(filter)}>
                                        Delete
                                    </Button>
                                </div>
                            </li>
                        {/each}
                    </ul>
                {/if}

                <Button on:click={openAddFilter}>Add filter</Button>
            </div>
        </div>
    </div>

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
    <label>
        Sparse frequency (every Nth image)
        <NumInput bind:value={$sparseFrequency} />
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label
        title="Prompt similarity cutoff (0–1) for similar exploration. Images are included when their prompt similarity to the previous selection is below this value. Lower values keep only more distinct images; higher values allow more similar prompts."
    >
        Similarity threshold
        <NumInput bind:value={$similarityThreshold} step="any" />
    </label>

    <div class="similar-cache-action">
        <Button on:click={onRecalculateSimilarCache}>
            {recalculatingSimilarCache ? 'Recalculating...' : 'Recalculate similarity cache'}
        </Button>
    </div>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Initial amount of images loaded (default: 25)
        <NumInput bind:value={$initialImages} />
    </label>

    <span class="gray">
        Image quality settings:
        <br />
        When using locally, recommended to use original and low
        <br />
        When using remotely, recommended to use medium and low for faster loading
        <br />
        Setting thumbnails to low allows for smoother scrolling even locally
        <br />
        * medium and low are slightly slower when seeing an image for the first time
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

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Slideshow interval (milliseconds)
        <NumInput bind:value={$slideDelay} />
    </label>

    <span class="gray"> Visual style settings </span>

    <label class="checkbox">
        Maximize fullscreen image size:
        <input type="checkbox" bind:checked={$fullscreenStyle} />
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Image grid size offset:
        <Input
            bind:value={$imageSize}
            placeholder="-100 (pixels) or 10vw + 50px"
        />
    </label>

    <label class="checkbox">
        Seamless grid:
        <input type="checkbox" bind:checked={$seamlessStyle} />
    </label>

    <label class="checkbox">
        Masonry layout:
        <input type="checkbox" bind:checked={$masonryLayout} />
    </label>

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

<style lang="scss">
    .container {
        padding: var(--main-padding);
        display: flex;
        flex-direction: column;
        gap: 1.5em;
    }

    .buttons :global(.disabled) {
        opacity: 0.5;
        filter: grayscale(1);
    }

    .gray {
        font-size: 0.8em;
        color: #aaa;
    }

    .similar-cache-action {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5em;
    }

    .sgroup {
        --gap: 10px;
        display: flex;
        flex-direction: column;
        gap: var(--gap);
        // border: 1px solid #aaaa;
        outline: solid 1px #aaa4;
        outline-offset: 10px;
        border-radius: 5px;
        padding: 10px;
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
            font-family: "Open sans", sans-serif;
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

        .instruction-controls {
            display: flex;
            flex-direction: column;
            gap: var(--gap);
        }

        .instruction-buttons {
            display: flex;
            gap: 1em;
            flex-wrap: wrap;
        }

        .filter-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: var(--gap);
        }

        .filter-row {
            display: flex;
            flex-wrap: wrap;
            align-items: flex-start;
            justify-content: space-between;
            gap: var(--gap);
            border-top: dashed 1px #aaa4;
            padding-top: var(--gap);
        }

        .filter-info {
            display: flex;
            flex-direction: column;
            gap: 0.25em;
            min-width: 0;
            flex: 1;
        }

        .filter-name {
            font-weight: 600;
        }

        .filter-preview {
            word-break: break-all;
        }

        .filter-buttons {
            display: flex;
            gap: 1em;
            flex-wrap: wrap;
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
