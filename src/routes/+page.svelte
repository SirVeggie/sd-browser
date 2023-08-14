<script lang="ts">
    import NavArrows from "$lib/components/NavArrows.svelte";
    import { notify } from "$lib/components/Notifier.svelte";
    import Button from "$lib/items/Button.svelte";
    import ImageDisplay from "$lib/items/ImageDisplay.svelte";
    import ImageFull from "$lib/items/ImageFull.svelte";
    import Input from "$lib/items/Input.svelte";
    import Intersecter from "$lib/items/Intersecter.svelte";
    import Link from "$lib/items/Link.svelte";
    import { imageAmountStore, imageStore } from "$lib/stores/imageStore";
    import {
        generateCompressedImages,
        getImageInfo,
        imageAction,
        searchImages,
        updateImages,
    } from "$lib/tools/imageRequests";
    import { mapImagesToClient } from "$lib/tools/misc";
    import {
        sortingMethods,
        type ClientImage,
        type ImageInfo,
        type SortingMethod,
    } from "$lib/types";
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import {
        nsfwFilter,
        folderFilter,
        nsfwMode,
        folderMode,
        searchFilter,
        collapseMode,
        compressedMode,
        matchingMode,
    } from "$lib/stores/searchStore";
    import { seamlessStyle } from "$lib/stores/styleStore";
    import {
        closeAllContextMenus,
        openContextMenu,
    } from "$lib/items/ContextMenu.svelte";
    import { createSelection } from "$lib/tools/selectManager";
    import { askConfirmation } from "$lib/components/Confirm.svelte";

    const increment = 25;
    let currentAmount = increment;
    let id = "";
    let inputElement: HTMLInputElement;
    let inputTimer: any;
    let info: ImageInfo | undefined = undefined;
    let slideTimer: any;
    let slideDir: "left" | "right" = "right";
    let updateTimer: any;
    let live = false;
    let sorting: SortingMethod = "date";
    let moreTriggerVisible = false;
    let triggerOverride = false;
    let triggerTimer: any;
    let updateTime = 0;
    let selecting = false;
    const selection = createSelection();

    $: paginated = $imageStore.slice(0, currentAmount);
    $: prevIndex = !id ? -1 : paginated.findIndex((img) => img.id === id) - 1;
    $: nextIndex = !id ? -1 : paginated.findIndex((img) => img.id === id) + 1;
    $: rightArrow = live || (nextIndex >= 0 && nextIndex < paginated.length);
    $: leftArrow = rightArrow && !live;
    $: latestId = paginated[0]?.id;
    $: seamless = $seamlessStyle;
    $: selection.setObjects(paginated.map((x) => x.id));

    onMount(() => {
        document.body.scrollIntoView();

        fetchImages();
        startUpdate();
        startTrigger(1000);

        window.addEventListener("keydown", keylistener);

        return () => {
            clearTimeout(inputTimer);
            clearInterval(updateTimer);
            clearInterval(slideTimer);
            closeImage();
            window.removeEventListener("keydown", keylistener);
        };
    });

    function openImage(img: ClientImage, e?: MouseEvent | KeyboardEvent) {
        // do nothing if not left click
        if (e && e instanceof MouseEvent && e.button !== 0) return;
        inputElement.blur();
        id = img.id;
        getImageInfo(img.id).then((res) => {
            info = res;
        });

        if ($compressedMode === "medium") {
            const currentImages = $imageStore;
            const startIndex = Math.max(
                0,
                currentImages.findIndex((img) => img.id === id) - 10
            );
            const endIndex = Math.min(currentImages.length, startIndex + 50);
            setTimeout(() => {
                console.log(
                    `Generating compressed images ${startIndex} - ${endIndex}`
                );
                generateCompressedImages(
                    currentImages.map((x) => x.id).slice(startIndex, endIndex)
                );
            }, 1000);
        }
    }

    function closeImage() {
        id = "";
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
        if (id) closeImage();
        live = true;
    }

    function goLeft() {
        if (leftArrow && prevIndex < 0) {
            openLive();
        } else if (leftArrow) {
            id = paginated[prevIndex].id;
            scrollToImage();
            getImageInfo(id).then((res) => {
                info = res;
            });

            if (slideTimer && slideDir === "right") {
                startSlideshow("left", false);
                notify("Sliding left", undefined, "dir");
            }
        }
    }

    function goRight() {
        if (live) {
            closeImage();
            openImage(paginated[0]);
        } else if (rightArrow) {
            id = paginated[nextIndex].id;
            if (nextIndex == paginated.length - 1) {
                loadMore();
            }
            scrollToImage();
            getImageInfo(id).then((res) => {
                info = res;
            });

            if (slideTimer && slideDir === "left") {
                startSlideshow("right", false);
                notify("Sliding right", undefined, "dir");
            }
        }
    }

    function scrollToImage() {
        const el = document.getElementById(`img_${id}`);
        if (el) {
            el.scrollIntoView({ behavior: "auto", block: "center" });
        }
    }

    function inputChange() {
        startUpdate();
        applyInput();
    }

    function applyInput() {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            startTrigger(500);
            document.body.scrollIntoView();
            currentAmount = increment;
            fetchImages();
        }, 1000);
    }

    function startUpdate() {
        clearInterval(updateTimer);
        updateTimer = setInterval(() => {
            // if (sorting === "random") return;
            // if ($searchFilter) return;
            console.log("Updating images");
            fetchUpdate();
        }, 1000);
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
            document.body.scrollIntoView();
            currentAmount = increment;
        } else {
            currentAmount = Math.min(currentAmount, 100);
        }

        startTrigger(1000);
        fetchImages();
    }

    function buildSearch() {
        let filters = [];
        if (!$nsfwMode && $nsfwFilter) filters.push($nsfwFilter);
        if ($folderMode && $folderFilter) filters.push($folderFilter);
        return {
            input: $searchFilter,
            filters,
        };
    }

    function fetchImages() {
        const search = buildSearch();

        searchImages({
            search: search.input,
            filters: search.filters,
            sorting,
            matching: $matchingMode,
            collapse: $collapseMode,
            nsfw: $nsfwMode,
            latestId: "",
            oldestId: "",
        })
            .then((images) => {
                imageStore.set(mapImagesToClient(images.imageIds));
                imageAmountStore.set(images.amount);
                updateTime = images.timestamp;
            })
            .catch((err) => {
                console.error(err);
            });
    }

    async function fetchNext() {
        const search = buildSearch();
        if ($imageStore.length === 0) return;
        const lastImage = $imageStore[$imageStore.length - 1];

        triggerOverride = true;

        try {
            const images = await searchImages({
                search: search.input,
                filters: search.filters,
                sorting,
                matching: $matchingMode,
                collapse: $collapseMode,
                latestId: "",
                oldestId: lastImage.id,
                nsfw: $nsfwMode,
            });

            if (images.amount === 0) return;
            if ($imageStore.some((x) => x.id === images.imageIds[0])) {
                console.log("Duplicate image found");
                return;
            }

            const mapped = mapImagesToClient(images.imageIds);
            imageStore.update((x) => [...x, ...mapped]);
            imageAmountStore.set(images.amount);
        } catch (e: any) {
            console.error(e);
        } finally {
            triggerOverride = false;
        }
    }

    async function fetchUpdate() {
        if ($imageStore.length === 0) return;
        const search = buildSearch();

        try {
            const res = await updateImages({
                search: search.input,
                filters: search.filters,
                matching: $matchingMode,
                collapse: $collapseMode,
                timestamp: updateTime,
                nsfw: $nsfwMode,
            });

            updateTime = res.timestamp;

            if (!res.additions.length) {
                if (!res.deletions.length) return;
                const dels = !res.deletions.some((x) =>
                    $imageStore.some((z) => z.id === x)
                );
                if (dels) return;
            }

            const mapped = mapImagesToClient(res.additions);
            let deletions = 0;

            imageStore.update((x) => {
                const modified = x.filter(
                    (z) => res.deletions.indexOf(z.id) === -1
                );
                deletions = x.length - modified.length;
                return [...mapped, ...modified];
            });

            imageAmountStore.set(
                $imageAmountStore + res.additions.length - deletions
            );
        } catch (e: any) {
            console.error(e);
        }
    }

    function loadMore() {
        startUpdate();
        const max = $imageStore.length;

        if (currentAmount < max - increment * 4) {
            startTrigger(250);
        } else if (currentAmount < $imageAmountStore) {
            fetchNext();
            startTrigger(250);
        }

        currentAmount = Math.min(max, currentAmount + increment);
    }

    function startSlideshow(dir: "left" | "right" = "right", ui = true) {
        if (slideTimer) stopSlideshow(false);
        slideDir = dir;
        slideTimer = setInterval(() => {
            if (dir === "right") {
                goRight();
            } else {
                goLeft();
            }
        }, 4000);
        if (ui) notify("Slideshow started");
    }

    function stopSlideshow(ui: boolean = true) {
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
            if (!id) return;
            e.preventDefault();
            if (slideTimer) {
                clearInterval(slideTimer);
                slideTimer = undefined;
                notify("Slideshow stopped");
            } else {
                startSlideshow();
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
        return (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const pos = {
                x: e.clientX,
                y: e.clientY,
            };
            const options: string[] = [];
            if (!selecting) options.push("Select");
            else options.push("Cancel selection", "Select row");
            if (!selecting) options.push("Delete");
            else options.push("Delete selected");

            closeAllContextMenus();
            openContextMenu(options, pos, (option) => {
                if (option === "Select") {
                    selection.select(id);
                    selecting = true;
                } else if (option === "Select row") {
                    selection.selectRow(id);
                    if ($selection.length === 0) selecting = false;
                } else if (option === "Cancel selection") {
                    cancelSelect();
                } else if (option === "Delete") {
                    deleteImg(id);
                } else if (option === "Delete selected") {
                    deleteSelected();
                } else {
                    return "keep";
                }
            });
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

    async function deleteImg(id: string) {
        if (!id) return;
        if (await askConfirmation("Delete image")) {
            imageAction(id, { type: "delete" });
        }
    }

    async function deleteSelected() {
        if ($selection.length === 0)
            return notify("No images selected", "warn");
        if (await askConfirmation("Delete images", `Delete ${$selection.length} images?`)) {
            imageAction($selection, { type: "delete" });
        }
    }

    function cancelSelect() {
        selecting = false;
        selection.deselectAll();
    }
</script>

<svelte:window on:keydown={handleEsc} />

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
            <input
                type="checkbox"
                id="collapse"
                bind:checked={$collapseMode}
                on:change={() => selectChange(true)}
            />
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
            <Input
                bind:element={inputElement}
                bind:value={$searchFilter}
                placeholder="Search"
                on:input={inputChange}
            />
            <Button on:click={() => (selecting = true)}>Select</Button>
            <Button on:click={openLive}>Live</Button>
            <Link to="/settings">Settings</Link>
        </div>
    {:else}
        <div class="nav">
            <Button on:click={deleteSelected}>Delete</Button>
            <div class="flexspacer" />
            <Button on:click={cancelSelect}>Cancel</Button>
        </div>
    {/if}
</div>

<div class="grid" class:seamless>
    {#each paginated as img (img.id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div
            id={`img_${img.id}`}
            class:selecting
            on:contextmenu={handleImgContext(img.id)}
            on:click={selectImg(img.id)}
        >
            <ImageDisplay
                {img}
                unselect={selecting && !$selection.includes(img.id)}
                onClick={(e) => openImage(img, e)}
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
    enabled={!!id || !!live}
    imageId={live ? latestId : id}
    data={info}
    cancel={closeImage}
/>

<NavArrows
    onLeft={goLeft}
    onRight={goRight}
    left={leftArrow}
    right={rightArrow}
    hidden={live}
/>

{#if id && !slideTimer}
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
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 0.8em;
        padding: calc(var(--main-padding) / 2) var(--main-padding);
        min-height: 100vh;

        &.seamless {
            gap: 2px;
        }

        @media (width > 1200px) {
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        }

        @media (width < 501px) {
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
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

    .selecting {
        & > :global(*) {
            pointer-events: none;
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
        // background-color: red;
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
            transition: 120ms transform ease, 120ms opacity ease;
            border-radius: 0.15em;
        }

        &:checked::before {
            transform: scale(1);
            opacity: 1;
        }
    }
</style>
