<script lang="ts">
    import NavArrows from "$lib/components/NavArrows.svelte";
    import { notify } from "$lib/components/Notifier.svelte";
    import Button from "$lib/items/Button.svelte";
    import ImageDisplay from "$lib/items/ImageDisplay.svelte";
    import ImageFull from "$lib/items/ImageFull.svelte";
    import Link from "$lib/items/Link.svelte";
    import SearchInput from "$lib/items/SearchInput.svelte";
    import Select from "$lib/items/Select.svelte";
    import { imageAmountStore, imageStore } from "$lib/stores/imageStore";
    import {
        generateCompressedImages,
        getImageInfo,
        imageAction,
        searchImages,
        subscribeImageStream,
    } from "$lib/requests/imageRequests";
    import { expandClientImages, formatSearchDateMinute } from "$lib/tools/misc";
    import {
        explorationModes,
        sortingMethods,
        type InputEvent,
        type SortingMethod,
    } from "$lib/types/misc";
    import { onMount, tick } from "svelte";
    import { fade } from "svelte/transition";
    import {
        nsfwMode,
        showNsfwFilter,
        searchFilter,
        explorationMode,
        compressedMode,
        slideDelay,
        initialImages,
        buildSearchParams,
        syncSearchInput,
        type SearchParams,
    } from "$lib/stores/searchStore";
    import { imageSize, seamlessStyle } from "$lib/stores/styleStore";
    import {
        closeAllContextMenus,
        type ContextMenuOption,
        openContextMenu,
    } from "$lib/items/ContextMenuManager.svelte";
    import { createSelection } from "$lib/tools/selectManager";
    import { askConfirmation } from "$lib/components/Confirm.svelte";
    import { sleep } from "$lib/tools/sleep";
    import {
        AUTO_LOAD_DEBOUNCE_MS,
        INITIAL_LOAD_THROTTLE_MS,
        isNearBottom,
    } from "$lib/tools/scrollLoadMore";
    import type { ClientImage, ImageInfo } from "$lib/types/images";
    import type { UpdateResponse } from "$lib/types/requests";
    import { fetchFolderPaths } from "$lib/requests/miscRequests";
    import { flyoutState } from "$lib/stores/flyoutStore";
    import BulkModal from "$lib/components/BulkModal.svelte";
    import FilterMultiSelect from "$lib/components/FilterMultiSelect.svelte";

    type ActionMode = "manual" | "auto";

    const initialAmount = Math.max($initialImages, 1);
    const increment = Math.max(initialAmount, 25);
    let currentAmount = initialAmount;
    let currentImage: ClientImage | undefined = undefined;
    let inputElement: HTMLInputElement;
    let inputTimer: any;
    let info: ImageInfo | undefined = undefined;
    let slideTimer: any;
    let slideDir: "left" | "right" = "right";
    let streamAbort: AbortController | undefined;
    let updateSessionId = 0;
    let searchSessionId = "";
    let live = false;
    let sorting: SortingMethod = "date";
    let triggerOverride = false;
    let updateTime = 0;
    let selecting = false;
    let bulkOpen = false;
    let bulkSearchParams: SearchParams = buildSearchParams();
    let searchCountComplete = false;
    const selection = createSelection();
    let anchorElement: HTMLDivElement;
    let scrollSessionStart = Date.now();
    let lastAutoLoadTime = 0;
    let scrollRaf: number | undefined;
    const loadedImageIds = new Set<string>();

    $: paginated = $imageStore.slice(0, currentAmount);
    $: prevIndex = !currentImage
        ? -1
        : paginated.findIndex((img) => img.id === currentImage?.id) - 1;
    $: nextIndex = !currentImage
        ? -1
        : paginated.findIndex((img) => img.id === currentImage?.id) + 1;
    $: rightArrow = live || (nextIndex >= 0 && nextIndex < paginated.length);
    $: leftArrow = (rightArrow || nextIndex == paginated.length) && !live;
    $: newestImage = paginated[0];
    $: seamless = $seamlessStyle;
    $: selection.setObjects(paginated.map((x) => x.id));
    $: slideshowInterval = Math.max($slideDelay, 100);
    $: gridStyle = `--size-offset:${parseSizeOffset($imageSize)}`;

    onMount(() => {
        scrollToTop();
        reconnectSearch();
        fetchFolderPaths().catch(() => {});

        window.addEventListener("keydown", keylistener);
        window.addEventListener("scroll", onScroll, { passive: true });

        return () => {
            clearTimeout(inputTimer);
            updateSessionId++;
            streamAbort?.abort();
            streamAbort = undefined;
            clearInterval(slideTimer);
            closeImage();
            window.removeEventListener("keydown", keylistener);
            window.removeEventListener("scroll", onScroll);
            if (scrollRaf !== undefined) cancelAnimationFrame(scrollRaf);
        };
    });

    function parseSizeOffset(str: string) {
        if (!str) return "0px";
        if (/^-?\d+$/.test(str)) return `${str}px`;
        return str;
    }

    function openImage(img: ClientImage, e?: MouseEvent | KeyboardEvent) {
        // do nothing if not left click
        if (e && e instanceof MouseEvent && e.button !== 0) return;
        currentImage = img;
        getImageInfo(img.id).then((res) => {
            info = res;
        });

        if ($compressedMode === "medium") {
            const currentImages = $imageStore;
            const startIndex = Math.max(
                0,
                currentImages.findIndex((img) => img.id === currentImage?.id) -
                    10,
            );
            const endIndex = Math.min(currentImages.length, startIndex + 50);
            setTimeout(() => {
                console.log(
                    `Generating compressed images ${startIndex} - ${endIndex}`,
                );
                generateCompressedImages(
                    currentImages.map((x) => x.id).slice(startIndex, endIndex),
                );
            }, 1000);
        }
    }

    function closeImage() {
        currentImage = undefined;
        info = undefined;
        live = false;
        if (slideTimer) {
            clearInterval(slideTimer);
            slideTimer = undefined;
            notify("Slideshow stopped");
        }
    }

    function openLive() {
        if (live) return;
        if (paginated.length === 0) return;
        if (currentImage) closeImage();
        live = true;
    }

    function goLeft(mode?: ActionMode) {
        if (leftArrow && prevIndex < 0) {
            if (!mode || typeof mode !== "string" || mode === "manual") {
                openLive();
            } else {
                return false;
            }
        } else if (leftArrow) {
            currentImage = paginated[prevIndex];
            scrollToImage();
            getImageInfo(currentImage!.id).then((res) => {
                info = res;
            });

            if (slideTimer && slideDir === "right") {
                startSlideshow("left", false);
                notify("Sliding left", undefined, "dir");
            }
        }

        return true;
    }

    function goRight() {
        if (live) {
            closeImage();
            openImage(paginated[0]);
        } else if (rightArrow) {
            currentImage = paginated[nextIndex];
            if (nextIndex == paginated.length - 1) {
                loadMore();
            }
            scrollToImage();
            getImageInfo(currentImage!.id).then((res) => {
                info = res;
            });

            if (slideTimer && slideDir === "left") {
                startSlideshow("right", false);
                notify("Sliding right", undefined, "dir");
            }
        }
    }

    function scrollToImage() {
        if (!currentImage) return;
        const el = document.getElementById(`img_${currentImage.id}`);
        if (el) {
            el.scrollIntoView({ behavior: "auto", block: "center" });
        }
    }

    function scrollToTop() {
        anchorElement.scrollIntoView();
    }

    function applySearchViewReset() {
        scrollToTop();
        currentAmount = initialAmount;
        resetScrollLoadSession();
    }

    function resetScrollLoadSession() {
        scrollSessionStart = Date.now();
        lastAutoLoadTime = 0;
        loadedImageIds.clear();
    }

    function onScroll() {
        if (scrollRaf !== undefined) return;
        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = undefined;
            maybeAutoLoadMore();
        });
    }

    function allVisibleImagesLoaded() {
        return paginated.every((img) => loadedImageIds.has(img.id));
    }

    function hasMoreImagesToLoad() {
        return (
            currentAmount < $imageStore.length ||
            currentAmount < $imageAmountStore
        );
    }

    function canAutoLoadMore() {
        if (!hasMoreImagesToLoad()) return false;
        if (Date.now() - lastAutoLoadTime < AUTO_LOAD_DEBOUNCE_MS) return false;

        const inInitialPeriod =
            Date.now() - scrollSessionStart < INITIAL_LOAD_THROTTLE_MS;
        if (inInitialPeriod && !allVisibleImagesLoaded()) return false;

        return true;
    }

    function maybeAutoLoadMore() {
        if (!canAutoLoadMore() || !isNearBottom()) return;
        lastAutoLoadTime = Date.now();
        loadMore();
    }

    function handleImageLoaded(id: string) {
        loadedImageIds.add(id);
        maybeAutoLoadMore();
    }

    function inputChange() {
        applyInput();
    }

    function applyInput() {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            reconnectSearch();
        }, 100);
    }

    function selectChange(_reset?: boolean) {
        reconnectSearch();
    }

    function reconnectSearch() {
        streamAbort?.abort();
        streamAbort = undefined;
        searchSessionId = "";
        const sessionId = ++updateSessionId;
        connectImageStream(sessionId);
    }

    function connectImageStream(expectedSessionId: number) {
        const abort = new AbortController();
        streamAbort = abort;
        const search = buildSearchParams();
        let hasReceivedImages = false;

        subscribeImageStream(
            {
                ...search,
                sorting,
            },
            {
                onInit: (init) => {
                    if (expectedSessionId !== updateSessionId) return;
                    searchSessionId = init.sessionId;
                    searchCountComplete = false;
                    updateTime = init.timestamp;
                },
                onChunk: (chunk) => {
                    if (expectedSessionId !== updateSessionId) return;
                    imageAmountStore.set(chunk.matched);
                    const mapped = expandClientImages(chunk.images);
                    if (!mapped.length) return;

                    if (!hasReceivedImages) {
                        hasReceivedImages = true;
                        applySearchViewReset();
                        imageStore.set(mapped);
                        return;
                    }

                    imageStore.update((x) => x.concat(mapped));
                },
                onReady: (ready) => {
                    if (expectedSessionId !== updateSessionId) return;
                    imageAmountStore.set(ready.amount);
                    searchCountComplete = true;
                    if (!hasReceivedImages && ready.amount === 0) {
                        applySearchViewReset();
                        imageStore.set([]);
                    }
                },
                onUpdate: (res) => applyUpdate(res, expectedSessionId),
            },
            abort.signal,
        ).catch((err) => {
            if (abort.signal.aborted || expectedSessionId !== updateSessionId) return;
            console.error(err);
            setTimeout(() => {
                if (abort.signal.aborted || expectedSessionId !== updateSessionId) return;
                connectImageStream(expectedSessionId);
            }, 2000);
        });
    }

    async function fetchNext() {
        const search = buildSearchParams();
        if ($imageStore.length === 0) return;
        const lastImage = $imageStore[$imageStore.length - 1];

        triggerOverride = true;

        try {
            const images = await searchImages({
                ...search,
                sorting,
                latestId: "",
                oldestId: lastImage.id,
                sessionId: searchSessionId || undefined,
            });

            if (images.amount <= 0) return;
            // TODO: is this check even useful?
            if ($imageStore.some((x) => x.id === images.images[0].id)) {
                console.log("Duplicate image found");
                return;
            }

            const mapped = expandClientImages(images.images);
            imageStore.update((x) => x.concat(mapped));
            imageAmountStore.set(images.amount);
        } catch (e: any) {
            console.error(e);
        } finally {
            triggerOverride = false;
        }
    }

    function applyUpdate(res: UpdateResponse, expectedSessionId: number) {
        if (expectedSessionId !== updateSessionId) return;
        if ($imageStore.length === 0) return;
        if (res.timestamp === -1) return;

        updateTime = res.timestamp;

        if (!res.additions.length) {
            if (!res.deletions.length) return;
            const nothingToDelete = !res.deletions.some((x) =>
                $imageStore.some((z) => z.id === x),
            );
            if (nothingToDelete) return;
        }

        const additions = res.additions.filter(
            (x) => !$imageStore.some((z) => z.id === x.id),
        );

        const mapped = expandClientImages(additions);
        let deletions = 0;

        imageStore.update((x) => {
            const modified = x.filter(
                (z) => res.deletions.indexOf(z.id) === -1,
            );
            deletions = x.length - modified.length;
            return mapped.concat(modified);
        });

        imageAmountStore.set(
            $imageAmountStore + additions.length - deletions,
        );
    }

    function loadMore() {
        const max = $imageStore.length;

        if (
            currentAmount >= max - increment * 4 &&
            currentAmount < $imageAmountStore
        ) {
            fetchNext();
        }

        currentAmount = Math.min(max, currentAmount + increment);
        scheduleAutoLoadCheck();
    }

    async function scheduleAutoLoadCheck() {
        await tick();
        requestAnimationFrame(() => maybeAutoLoadMore());
    }

    function slideshowLoop(dir: string) {
        if (dir === "right") {
            goRight();
        } else {
            const success = goLeft("auto");

            if (!success) {
                clearInterval(slideTimer);
                slideTimer = setInterval(slideshowWait, 100);
            }
        }
    }

    function slideshowWait() {
        if (prevIndex >= 0) {
            clearInterval(slideTimer);
            slideTimer = setInterval(slideshowLoop, slideshowInterval);
            goLeft("auto");
        }
    }

    function startSlideshow(dir: "left" | "right" = "right", ui = true) {
        if (slideTimer) stopSlideshow(false);
        slideDir = dir;
        slideTimer = setInterval(() => slideshowLoop(dir), slideshowInterval);
        if (ui) notify("Slideshow started");
    }

    function stopSlideshow(ui = true) {
        if (slideTimer) {
            clearInterval(slideTimer);
            slideTimer = undefined;
            if (ui) notify("Slideshow stopped");
        }
    }

    function keylistener(e: KeyboardEvent) {
        if (e.key === "ArrowLeft") {
            goLeft();
        } else if (e.key === "ArrowRight") {
            goRight();
        } else if (e.key === " ") {
            if (!currentImage) return;
            e.preventDefault();
            if (slideTimer) {
                clearInterval(slideTimer);
                slideTimer = undefined;
                notify("Slideshow stopped");
            } else {
                startSlideshow();
            }
        } else if (e.key === "f") {
            const active = document.activeElement;
            if (active?.tagName !== "INPUT") {
                flyoutState.set(!$flyoutState);
            }
        }
    }

    function handleEsc(e: KeyboardEvent) {
        if (e.key === "Escape" && selecting) {
            selection.deselectAll();
            selecting = false;
        }
    }

    function handleImgContext(id: string) {
        return async (e: InputEvent) => {
            const pos = getEventCoords(e);
            closeAllContextMenus();
            openContextMenu(pos, [
                {
                    name: "Select",
                    visible: !selecting,
                    handler() {
                        selection.select(id);
                        selecting = true;
                    },
                },
                {
                    name: "Cancel selection",
                    visible: selecting,
                    handler: cancelSelect,
                },
                {
                    name: "Select row",
                    visible: selecting,
                    handler() {
                        selection.selectRow(id);
                        if ($selection.length === 0) selecting = false;
                    },
                },
                {
                    name: "Open folder",
                    visible: !selecting,
                    handler: () => openFolder(id),
                },
                {
                    name: "Show similar",
                    visible: !selecting,
                    handler() {
                        explorationMode.set('none');
                        searchFilter.set(`SIMILAR ${id}`);
                        selectChange(true);
                    },
                },
                {
                    name: "Jump to",
                    visible: !selecting,
                    async handler() {
                        const imageInfo = await getImageInfo(id);
                        if (!imageInfo) return;
                        sorting = 'date';
                        searchFilter.set(`DT TO ${formatSearchDateMinute(imageInfo.modifiedDate)}`);
                        selectChange(true);
                    },
                },
                {
                    name: "Move",
                    handler: () => folderActionMenu(id, "move"),
                },
                {
                    name: "Copy",
                    handler: () => folderActionMenu(id, "copy"),
                },
                {
                    name: "Delete",
                    visible: !selecting,
                    handler: () => deleteImg(id),
                },
                {
                    name: "Delete selected",
                    visible: selecting,
                    handler: deleteSelected,
                },
            ]);
        };
    }
    
    function handleSelectionButton(type: "move" | "copy") {
        return async (e: InputEvent) => {
            const pos = getEventCoords(e);
            closeAllContextMenus();
            const options = await folderActionMenu("", type);
            openContextMenu(pos, options);
        };
    }

    async function folderActionMenu(
        id: string,
        type: "move" | "copy",
    ): Promise<ContextMenuOption[]> {
        const list = await fetchFolderPaths();
        return list.map((folder) => ({
            name: folder,
            handler: () =>
                imageAction(selecting ? $selection : id, {
                    type,
                    folder,
                }),
        }));
    }

    function getEventCoords(e: InputEvent) {
        if (e instanceof MouseEvent) {
            return {
                x: e.clientX,
                y: e.clientY,
            };
        }
        if (e instanceof TouchEvent) {
            return {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
            };
        }

        const rect = (e.target as Element)?.getBoundingClientRect();
        if (rect) {
            return {
                x: rect.left,
                y: rect.top,
            };
        }

        return {
            x: 0,
            y: 0,
        };
    }

    function selectImg(id: string) {
        return (e: MouseEvent) => {
            if (selecting) {
                e.preventDefault();

                if (e.shiftKey) {
                    selection.selectRow(id);
                } else {
                    selection.select(id);
                }

                if ($selection.length === 0) selecting = false;
            }
        };
    }
    
    function fillSelected() {
        selection.fillSelection();
    }

    async function deleteImg(id: string) {
        if (!id) return;
        if (await askConfirmation("Delete image")) {
            imageAction(id, { type: "delete" });
            removeImagesFromUI([id]);
        }
    }

    async function deleteSelected() {
        await sleep(25);
        if ($selection.length === 0)
            return notify("No images selected", "warn");
        if (
            await askConfirmation(
                "Delete images",
                `Delete ${$selection.length} images?`,
            )
        ) {
            imageAction($selection, { type: "delete" });
            removeImagesFromUI($selection);
        }
    }

    function removeImagesFromUI(ids: string[]) {
        let change = 0;
        let current = 0;
        imageStore.update((x) => {
            const initial = x.length;
            x = x.filter((z) => !ids.includes(z.id));
            current = x.length;
            change = initial - current;
            return x;
        });
        imageAmountStore.update((x) => x - change);
        currentAmount = Math.min(current, currentAmount);
        cancelSelect();
    }

    function cancelSelect() {
        selecting = false;
        selection.deselectAll();
    }

    function openFolder(id: string) {
        imageAction(id, { type: "open" });
    }

    function openBulk() {
        syncSearchInput(inputElement);
        bulkSearchParams = buildSearchParams(inputElement?.value);
        bulkOpen = true;
    }

    function handleBulkComplete(refresh?: boolean) {
        if (refresh) {
            reconnectSearch();
        }
    }
</script>

<svelte:window on:keydown={handleEsc} />

<div class="anchor" bind:this={anchorElement} />
<div class="topbar">
    <div class="quickbar">
        <span class="image-count">
            Images: {paginated.length} /
            <span class:pending={!searchCountComplete}>{$imageAmountStore}</span>
        </span>

        <Select
            id="sorting"
            prefix="Sorting"
            bind:value={sorting}
            options={sortingMethods}
            on:change={() => selectChange(true)}
        />

        <Select
            id="collapse"
            prefix="Collapse"
            bind:value={$explorationMode}
            options={explorationModes}
            on:change={() => selectChange(true)}
        />

        <FilterMultiSelect onChange={() => selectChange(false)} />

        {#if $showNsfwFilter}
            <label for="nsfw">
                NSFW:
                <input
                    type="checkbox"
                    id="nsfw"
                    bind:checked={$nsfwMode}
                    on:change={() => selectChange(false)}
                />
            </label>
        {/if}
    </div>

    {#if !selecting}
        <div class="nav">
            <SearchInput
                bind:element={inputElement}
                bind:value={$searchFilter}
                placeholder="Search"
                on:input={inputChange}
            />
            <Button on:click={() => (selecting = true)}>Select</Button>
            <Button on:click={openLive}>Live</Button>
            <Button on:click={openBulk}>Bulk</Button>
            <Link to="/settings">Settings</Link>
        </div>
    {:else}
        <div class="nav">
            <Button on:click={deleteSelected}>Delete</Button>
            <Button on:click={handleSelectionButton("move")}>Move</Button>
            <Button on:click={handleSelectionButton("copy")}>Copy</Button>
            <Button on:click={fillSelected}>Fill</Button>
            <div class="flexspacer" />
            <Button on:click={cancelSelect}>Cancel</Button>
        </div>
    {/if}
</div>

<div class="grid" class:seamless style={gridStyle}>
    {#each paginated as img (img.id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div id={`img_${img.id}`} class:selecting on:click={selectImg(img.id)}>
            <ImageDisplay
                {img}
                unselect={selecting && !$selection.includes(img.id)}
                onClick={!selecting && ((e) => openImage(img, e))}
                onContext={handleImgContext(img.id)}
                onLoaded={() => handleImageLoaded(img.id)}
            />
        </div>
    {/each}
</div>

<div class="loader">
    {#if triggerOverride}
        <div><p>loading...</p></div>
    {:else if paginated.length === $imageAmountStore}
        <div><p>You've reached the end.</p></div>
    {:else}
        <div>
            <button on:click={loadMore}>
                (click here to load more images)
            </button>
        </div>
    {/if}
    <div class="spacer" />
</div>

<div class="spacer2" />

<ImageFull
    enabled={!!currentImage || !!live}
    image={live ? newestImage : currentImage}
    data={info}
    cancel={closeImage}
/>

{#if bulkOpen}
    <BulkModal
        imageCount={$imageAmountStore}
        searchParams={bulkSearchParams}
        on:close={() => (bulkOpen = false)}
        onComplete={handleBulkComplete}
    />
{/if}

<NavArrows
    onLeft={goLeft}
    onRight={goRight}
    left={leftArrow}
    right={rightArrow}
    hidden={live}
/>

{#if currentImage && !slideTimer}
    <div class="slideshow" transition:fade={{ duration: 100 }}>
        <Button on:click={() => startSlideshow()}>Slideshow</Button>
    </div>
{/if}

<style lang="scss">
    .topbar {
        position: sticky;
        top: 0;
        background-color: #242424;
        z-index: 1;
        padding-inline: calc(var(--main-padding) / 1);
        padding-top: calc(var(--main-padding) / 4);
        box-shadow: 0 35px 10px -32px rgba(0, 0, 0, 0.5);

        @media (width < 501px) {
            padding-inline: calc(var(--main-padding) / 2);
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
        }
    }

    .quickbar {
        display: flex;
        justify-content: space-between;
        gap: 0.5em;
        flex-wrap: wrap;
        align-items: center;
        user-select: none;
        font-family: "Open sans", sans-serif;
        font-size: 0.8em;
        color: #ddd;
        margin-bottom: 0.5em;

        .image-count .pending {
            opacity: 0.45;
        }
    }

    .nav {
        display: flex;
        gap: 0.5em;
        padding-bottom: 0.5em;

        & > :global(.input) {
            flex-grow: 1;
        }
    }

    .grid {
        display: grid;
        grid-template-columns: repeat(
            auto-fill,
            minmax(calc(200px + var(--size-offset)), 1fr)
        );
        gap: 0.8em;
        padding: calc(var(--main-padding) / 2) var(--main-padding);
        min-height: 100vh;

        &.seamless {
            gap: 2px;
            padding: 5px;
        }

        @media (width > 1200px) {
            grid-template-columns: repeat(
                auto-fill,
                minmax(calc(250px + var(--size-offset)), 1fr)
            );
        }

        @media (width < 501px) {
            grid-template-columns: repeat(
                auto-fill,
                minmax(calc(130px + var(--size-offset)), 1fr)
            );
            gap: 0.2em;
            padding: 5px;
        }
    }

    .slideshow {
        position: fixed;
        top: 1.5em;
        right: calc(2em + var(--flyout-width));
        z-index: 5;

        :global(.flanimate) & {
            transition: right 0.2s ease;
        }
    }

    .spacer {
        height: 100px;
    }

    .spacer2 {
        height: 60vh;
    }

    .flexspacer {
        flex-grow: 1;
    }

    .loader {
        & > :global(:first-child) {
            display: flex;
            justify-content: center;
            margin-top: 1em;
        }

        p,
        button {
            background-color: transparent;
            border: none;
            font-family: "Open sans", sans-serif;
            font-size: 1em;
            color: #ddd;
            display: block;
            margin: 1em 0 0 0;
        }

        button {
            cursor: pointer;
        }
    }

    label {
        display: flex;
        align-items: center;
        gap: 0.5em;
        cursor: pointer;
        user-select: none;
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
