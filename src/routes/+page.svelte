<script lang="ts">
    import NavArrows from "$lib/components/NavArrows.svelte";
    import { notify } from "$lib/components/Notifier.svelte";
    import Button from "$lib/items/Button.svelte";
    import ImageDisplay from "$lib/items/ImageDisplay.svelte";
    import ImageFull from "$lib/items/ImageFull.svelte";
    import Intersecter from "$lib/items/Intersecter.svelte";
    import Link from "$lib/items/Link.svelte";
    import SearchInput from "$lib/items/SearchInput.svelte";
    import { imageAmountStore, imageStore } from "$lib/stores/imageStore";
    import {
        generateCompressedImages,
        getImageInfo,
        imageAction,
        searchImages,
        subscribeImageStream,
    } from "$lib/requests/imageRequests";
    import { expandClientImages, formatSearchDateMinute, stringSort } from "$lib/tools/misc";
    import {
        explorationModes,
        sortingMethods,
        type InputEvent,
        type SortingMethod,
    } from "$lib/types/misc";
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import {
        nsfwMode,
        folderMode,
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
    import type { ClientImage, ImageInfo } from "$lib/types/images";
    import type { UpdateResponse } from "$lib/types/requests";
    import { fetchFolderStructure } from "$lib/requests/miscRequests";
    import { flyoutState } from "$lib/stores/flyoutStore";
    import BulkModal from "$lib/components/BulkModal.svelte";

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
    let moreTriggerVisible = false;
    let triggerOverride = false;
    let triggerTimer: any;
    let updateTime = 0;
    let selecting = false;
    let bulkOpen = false;
    let bulkSearchParams: SearchParams = buildSearchParams();
    const selection = createSelection();
    let anchorElement: HTMLDivElement;

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
        startTrigger(1000);

        window.addEventListener("keydown", keylistener);

        return () => {
            clearTimeout(inputTimer);
            updateSessionId++;
            streamAbort?.abort();
            streamAbort = undefined;
            clearInterval(slideTimer);
            closeImage();
            window.removeEventListener("keydown", keylistener);
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

    function inputChange() {
        applyInput();
    }

    function applyInput() {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            startTrigger(500);
            scrollToTop();
            currentAmount = initialAmount;
            reconnectSearch();
        }, 100);
    }

    function startTrigger(delay: number) {
        moreTriggerVisible = false;
        clearTimeout(triggerTimer);
        triggerTimer = setTimeout(() => {
            moreTriggerVisible = true;
        }, delay);
    }

    function selectChange(reset?: boolean) {
        if (reset) {
            scrollToTop();
            currentAmount = initialAmount;
        } else {
            currentAmount = Math.min(currentAmount, initialAmount);
        }

        startTrigger(1000);
        reconnectSearch();
    }

    function reconnectSearch() {
        streamAbort?.abort();
        streamAbort = undefined;
        searchSessionId = "";
        const sessionId = ++updateSessionId;

        if (sorting === "random") {
            fetchImagesWithoutStream(sessionId);
            return;
        }

        connectImageStream(sessionId);
    }

    function connectImageStream(expectedSessionId: number) {
        const abort = new AbortController();
        streamAbort = abort;
        const search = buildSearchParams();

        subscribeImageStream(
            {
                ...search,
                sorting,
                nsfw: $nsfwMode,
            },
            {
                onInit: (init) => {
                    if (expectedSessionId !== updateSessionId) return;
                    searchSessionId = init.sessionId;
                    imageStore.set(expandClientImages(init.images));
                    imageAmountStore.set(init.amount);
                    updateTime = init.timestamp;
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

    function fetchImagesWithoutStream(expectedSessionId: number) {
        const search = buildSearchParams();

        searchImages({
            ...search,
            sorting,
            nsfw: $nsfwMode,
            latestId: "",
            oldestId: "",
        })
            .then((images) => {
                if (expectedSessionId !== updateSessionId) return;
                if (images.amount === -1) return;
                imageStore.set(expandClientImages(images.images));
                imageAmountStore.set(images.amount);
                updateTime = images.timestamp;
            })
            .catch((err) => {
                console.error(err);
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
                nsfw: $nsfwMode,
                sessionId: searchSessionId || undefined,
            });

            if (images.amount <= 0) return;
            // TODO: is this check even useful?
            if ($imageStore.some((x) => x.id === images.images[0].id)) {
                console.log("Duplicate image found");
                return;
            }

            const mapped = expandClientImages(images.images);
            imageStore.update((x) => [...x, ...mapped]);
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
            return [...mapped, ...modified];
        });

        imageAmountStore.set(
            $imageAmountStore + additions.length - deletions,
        );
    }

    function loadMore() {
        const max = $imageStore.length;

        if (currentAmount < max - increment * 4) {
            startTrigger(250);
        } else if (currentAmount < $imageAmountStore) {
            fetchNext();
            startTrigger(250);
        }

        currentAmount = Math.min(max, currentAmount + increment);
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
                    handler: () => moveImages(id),
                },
                {
                    name: "Copy",
                    handler: () => copyImages(id),
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
            const options = type === "move" ? await moveImages("") : await copyImages("");
            openContextMenu(pos, options);
        };
    }

    async function moveImages(id: string): Promise<ContextMenuOption[]> {
        const folders = (await fetchFolderStructure())
            .sort(stringSort((x) => x.name))
            .reverse();
        const list: string[] = ["/"];

        while (folders.length) {
            const folder = folders.pop()!;
            list.push(
                `${folder.parent}/${folder.name}`
                    .replace(/^\//, "")
                    .replace(/\\/, "/"),
            );
            if (folder.subfolders) {
                folders.push(
                    ...folder.subfolders
                        .sort(stringSort((x) => x.name))
                        .reverse(),
                );
            }
        }

        return list.map((x) => ({
            name: x,
            handler: () =>
                imageAction(selecting ? $selection : id, {
                    type: "move",
                    folder: x,
                }),
        }));
    }

    async function copyImages(id: string): Promise<ContextMenuOption[]> {
        const folders = (await fetchFolderStructure())
            .sort(stringSort((x) => x.name))
            .reverse();
        const list: string[] = ["/"];

        while (folders.length) {
            const folder = folders.pop()!;
            list.push(
                `${folder.parent}/${folder.name}`
                    .replace(/^\//, "")
                    .replace(/\\/, "/"),
            );
            if (folder.subfolders) {
                folders.push(
                    ...folder.subfolders
                        .sort(stringSort((x) => x.name))
                        .reverse(),
                );
            }
        }

        return list.map((x) => ({
            name: x,
            handler: () =>
                imageAction(selecting ? $selection : id, {
                    type: "copy",
                    folder: x,
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
        <span>Images: {paginated.length} / {$imageAmountStore}</span>

        <label for="sorting">
            Sorting:
            <select
                id="sorting"
                bind:value={sorting}
                on:change={() => selectChange(true)}
            >
                {#each sortingMethods as method}
                    <option value={method}>{method}</option>
                {/each}
            </select>
        </label>

        <label for="collapse">
            Collapse:
            <select
                id="collapse"
                bind:value={$explorationMode}
                on:change={() => selectChange(true)}
            >
                {#each explorationModes as mode}
                    <option value={mode}>{mode}</option>
                {/each}
            </select>
        </label>

        <label for="nsfw">
            NSFW:
            <input
                type="checkbox"
                id="nsfw"
                bind:checked={$nsfwMode}
                on:change={() => selectChange(false)}
            />
        </label>

        <label for="folderFilter">
            Folder filter:
            <input
                type="checkbox"
                id="folderFilter"
                bind:checked={$folderMode}
                on:change={() => selectChange(false)}
            />
        </label>
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
            />
        </div>
    {/each}
</div>

{#if moreTriggerVisible}
    <div class="loader">
        {#if triggerOverride}
            <div><p>loading...</p></div>
        {:else if paginated.length === $imageAmountStore}
            <div><p>You've reached the end.</p></div>
        {:else}
            <Intersecter onVisible={loadMore}>
                <button on:click={loadMore}>
                    (click here to load more images)
                </button>
            </Intersecter>
        {/if}
        <div class="spacer" />
    </div>
{/if}

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

    label {
        display: flex;
        align-items: center;
        gap: 0.5em;
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
