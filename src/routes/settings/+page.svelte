<script lang="ts">
    import Input from "$lib/items/Input.svelte";
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
        folderFilter,
        initialImages,
        matchingMode,
        nsfwFilter,
        similarityAlgorithm,
        similarityThreshold,
        slideDelay,
        sparseFrequency,
        thumbMode,
    } from "$lib/stores/searchStore";
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
        seamlessStyle,
    } from "$lib/stores/styleStore";
    import NumInput from "$lib/items/NumInput.svelte";
    import SystemInstructionModal from "$lib/components/SystemInstructionModal.svelte";
    import { askConfirmation } from "$lib/components/Confirm.svelte";
    import {
        llmStore,
        type SystemInstruction,
    } from "$lib/stores/llmStore";
    import { authLogout, authStore } from "$lib/stores/authStore";
    import { pullGlobalSettings } from "$lib/requests/settingRequests";
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
    let selectedInstructionId = "";
    let instructionModalOpen = false;
    let editingInstruction: SystemInstruction | null = null;
    let modalInstructionName = "";
    let modalInstructionText = "";

    $: {
        const instructions = $llmStore.systemInstructions;
        if (!instructions.some((item) => item.id === selectedInstructionId)) {
            selectedInstructionId = instructions[0]?.id ?? "";
        }
    }

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

                <label for="matching">
                    Styling:
                    <select
                        id="matching"
                        bind:value={flyoutMode}
                        on:change={onFlyoutModeChange}
                    >
                        {#each flyoutModes as mode}
                            <option value={mode}>{mode}</option>
                        {/each}
                    </select>
                </label>

                <label class="checkbox">
                    Show button:
                    <input type="checkbox" bind:checked={$flyoutButton} />
                </label>

                <label for="matching">
                    Button position:
                    <select
                        id="matching"
                        bind:value={flyoutButtonPosition}
                        on:change={onFlyoutButtonPositionChange}
                    >
                        {#each ["top", "bottom"] as mode}
                            <option value={mode}>{mode}</option>
                        {/each}
                    </select>
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
                            <label>
                                Saved instructions
                                <select bind:value={selectedInstructionId}>
                                    {#each $llmStore.systemInstructions as instruction (instruction.id)}
                                        <option value={instruction.id}>
                                            {instruction.name}
                                        </option>
                                    {/each}
                                </select>
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

    <div class="gray">
        Search keywords:<br /><span>
            {searchKeywords.join(", ").replaceAll("|", " | ")}
        </span>
    </div>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Folder filter
        <span class="gray">
            (Hides images in img2img, xxx-grids and extra folders by default)
        </span>
        <Input bind:value={$folderFilter} />
    </label>
    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        NSFW filter
        <span class="gray">
            (Added to the search when NSFW toggle is disabled)
        </span>
        <Input bind:value={$nsfwFilter} />
    </label>

    <label for="matching">
        Matching:
        <select id="matching" bind:value={$matchingMode}>
            {#each searchModes as method}
                <option value={method}>{method}</option>
            {/each}
        </select>
    </label>

    <label for="similarityAlgorithm">
        Similarity algorithm:
        <select id="similarityAlgorithm" bind:value={$similarityAlgorithm}>
            {#each similarityAlgorithms as algorithm}
                <option value={algorithm}>{algorithm}</option>
            {/each}
        </select>
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Sparse frequency (every Nth image)
        <NumInput bind:value={$sparseFrequency} />
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Similarity threshold
        <NumInput bind:value={$similarityThreshold} />
    </label>

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
        <select id="fullimage" bind:value={$compressedMode}>
            {#each qualityModes as quality}
                <option value={quality}>{quality}</option>
            {/each}
        </select>
    </label>

    <label for="thumbnail">
        Thumbnail quality:
        <select id="thumbnail" bind:value={$thumbMode}>
            {#each qualityModes as quality}
                <option value={quality}>{quality}</option>
            {/each}
        </select>
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

    select {
        margin: 0;
        padding: 0;
        background-color: transparent;
        border: none;
        font-family: "Open sans", sans-serif;
        font-size: 1em;
        color: #ddd;
        border-radius: 0.2em;

        &:focus {
            outline: none;
        }

        &:focus-visible {
            background-color: #333;
        }

        option {
            background-color: #222;
        }
    }
</style>
