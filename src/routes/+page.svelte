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
    import { getImageInfo, searchImages } from "$lib/tools/imageRequests";
    import { mapImagesToClient, validRegex } from "$lib/tools/misc";
    import {
        sortingMethods,
        type ClientImage,
        type ImageInfo,
        type SortingMethod,
        type SearchMode,
        searchModes,
    } from "$lib/types";
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import {
        nsfwFilter,
        folderFilter,
        webpMode,
        nsfwMode,
        folderMode,
    } from "$lib/stores/searchStore";

    const increment = 10;
    let currentAmount = increment;
    let id = "";
    let input = "";
    let inputElement: HTMLInputElement;
    let info: ImageInfo | undefined = undefined;
    let slideshowTimer: any;
    let inputTimer: any;
    let updateTimer: any;
    let currentSearch = "";
    let live = false;
    let sorting: SortingMethod = "date";
    let matching: SearchMode = "regex";
    let moreTriggerVisible = false;

    $: paginated = $imageStore.slice(0, currentAmount);
    $: prevIndex = !id ? -1 : paginated.findIndex((img) => img.id === id) - 1;
    $: nextIndex = !id ? -1 : paginated.findIndex((img) => img.id === id) + 1;
    $: leftArrow = prevIndex >= 0;
    $: rightArrow = nextIndex >= 0 && nextIndex < paginated.length;
    $: latestId = paginated[0]?.id;

    onMount(() => {
        updateImages(currentSearch);

        updateTimer = setInterval(() => {
            if (sorting === "random") return;
            updateImages(currentSearch);
        }, 5000);

        setTimeout(() => {
            moreTriggerVisible = true;
        }, 1000);

        window.addEventListener("keydown", keylistener);

        return () => {
            clearTimeout(inputTimer);
            clearInterval(updateTimer);
            clearInterval(slideshowTimer);
            closeImage();
            window.removeEventListener("keydown", keylistener);
        };
    });

    function openImage(img: ClientImage, e?: MouseEvent | KeyboardEvent) {
        inputElement.blur();
        id = img.id;
        getImageInfo(img.id).then((res) => {
            info = res;
        });
    }

    function closeImage() {
        id = "";
        info = undefined;
        live = false;
        if (slideshowTimer) {
            clearInterval(slideshowTimer);
            slideshowTimer = undefined;
            notify("Slideshow stopped");
        }
    }

    function goLeft() {
        if (leftArrow) {
            id = paginated[prevIndex].id;
            scrollToImage();
        }
    }

    function goRight() {
        if (rightArrow) {
            id = paginated[nextIndex].id;
            if (nextIndex == paginated.length - 1) {
                loadMore();
            }
            scrollToImage();
        }
    }

    function scrollToImage() {
        const el = document.getElementById(`img_${id}`);
        if (el) {
            el.scrollIntoView({ behavior: "auto", block: "center" });
        }
    }

    function inputChange() {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            applyInput();
        }, 1000);
    }

    function applyInput() {
        if (!validRegex(input)) return;
        currentAmount = increment;
        updateImages(input);
    }

    function selectChange() {
        updateImages(currentSearch);
    }

    function updateImages(search: string) {
        currentSearch = search;
        if (!$nsfwMode && $nsfwFilter) search += ` AND ${$nsfwFilter}`;
        if ($folderMode) search += ` AND ${$folderFilter}`;

        searchImages({
            search,
            sorting,
            matching,
        })
            .then((images) => {
                imageStore.set(mapImagesToClient(images.imageIds));
                imageAmountStore.set(images.amount);
            })
            .catch((err) => {
                console.error(err);
            });
    }

    function loadMore() {
        currentAmount += increment;
    }

    function startSlideshow() {
        slideshowTimer = setInterval(() => {
            console.log("next image");
            goRight();
        }, 4000);
        notify("Slideshow started");
    }

    function keylistener(e: KeyboardEvent) {
        if (e.key === "ArrowLeft") {
            goLeft();
        } else if (e.key === "ArrowRight") {
            goRight();
        } else if (e.key === " ") {
            if (!id) return;
            e.preventDefault();
            if (slideshowTimer) {
                clearInterval(slideshowTimer);
                slideshowTimer = undefined;
                notify("Slideshow stopped");
            } else {
                startSlideshow();
            }
        }
    }
</script>

<div class="topbar">
    <div class="quickbar">
        <span>Images: {paginated.length} / {$imageAmountStore}</span>
        <label for="sorting">
            Sorting:
            <select id="sorting" bind:value={sorting} on:change={selectChange}>
                {#each sortingMethods as method}
                    <option value={method}>{method}</option>
                {/each}
            </select>
        </label>

        <label for="matching">
            Matching:
            <select
                id="matching"
                bind:value={matching}
                on:change={selectChange}
            >
                {#each searchModes as method}
                    <option value={method}>{method}</option>
                {/each}
            </select>
        </label>

        <label for="nsfw">
            NSFW:
            <input
                type="checkbox"
                id="nsfw"
                bind:checked={$nsfwMode}
                on:change={selectChange}
            />
        </label>

        <label for="folderFilter">
            Folder filter:
            <input
                type="checkbox"
                id="folderFilter"
                bind:checked={$folderMode}
                on:change={selectChange}
            />
        </label>

        <label for="webp">
            Use webp:
            <input type="checkbox" id="webp" bind:checked={$webpMode} />
        </label>
    </div>

    <div class="nav">
        <Input
            bind:element={inputElement}
            bind:value={input}
            placeholder="Search"
            on:input={inputChange}
        />
        <Button on:click={() => (live = true)}>Live</Button>
        <Link to="/settings">Settings</Link>
    </div>
</div>

<div class="grid">
    {#each paginated as img (img.id)}
        <div id={`img_${img.id}`}>
            <ImageDisplay {img} onClick={(e) => openImage(img, e)} />
        </div>
    {/each}
</div>

{#if moreTriggerVisible}
    <div class="loader">
        <Intersecter onVisible={loadMore}>
            {#if paginated.length === $imageStore.length}
                <p>You've reached the end.</p>
            {:else}
                <button on:click={loadMore}>
                    (click here to load more images)
                </button>
            {/if}
        </Intersecter>
        <div class="spacer" />
    </div>
{/if}

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
/>

{#if id && !slideshowTimer}
    <div class="slideshow" transition:fade={{ duration: 100 }}>
        <Button on:click={startSlideshow}>Slideshow</Button>
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
        grid-gap: 1em;
        padding: calc(var(--main-padding) / 2) var(--main-padding);
    }

    .slideshow {
        position: fixed;
        top: 1.5em;
        right: 2em;
        z-index: 5;
    }

    .spacer {
        height: 100px;
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
