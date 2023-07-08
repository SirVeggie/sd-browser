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
    import { onDestroy, onMount } from "svelte";
    import { fade } from "svelte/transition";

    const increment = 20;
    let currentAmount = increment;
    let id = "";
    let input = "";
    let info: ImageInfo | undefined = undefined;
    let slideshowTimer: any;
    let inputTimer: any;
    let updateTimer: any;
    let currentSearch = "";
    let live = false;
    let sorting: SortingMethod = "date";
    let matching: SearchMode = "advanced";

    $: paginated = $imageStore.slice(0, currentAmount);
    $: prevIndex = !id ? -1 : paginated.findIndex((img) => img.id === id) - 1;
    $: nextIndex = !id ? -1 : paginated.findIndex((img) => img.id === id) + 1;
    $: leftArrow = prevIndex >= 0;
    $: rightArrow = nextIndex >= 0 && nextIndex < paginated.length;
    $: latestId = paginated[0]?.id;

    onMount(() => {
        updateTimer = setInterval(() => {
            if (sorting === "random") return;
            updateImages(currentSearch);
        }, 1000);
    });

    onDestroy(() => {
        clearTimeout(inputTimer);
        clearInterval(updateTimer);
        clearInterval(slideshowTimer);
        closeImage();
    });

    function openImage(img: ClientImage) {
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

    function selectChange() {
        updateImages(currentSearch);
    }

    function applyInput() {
        if (!validRegex(input)) return;
        currentAmount = increment;
        updateImages(input);
    }

    function updateImages(search: string) {
        searchImages({
            search,
            sorting,
            matching,
        })
            .then((images) => {
                currentSearch = search;
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
        }, 5000);
        notify("Slideshow started");
    }
</script>

<div class="stats">
    <span>Images found: {$imageAmountStore}</span>
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
        <select id="matching" bind:value={matching} on:change={selectChange}>
            {#each searchModes as method}
                <option value={method}>{method}</option>
            {/each}
        </select>
    </label>
</div>

<div class="nav">
    <Link to="/">Back</Link>
    <div class="spacing" />
    <Input bind:value={input} placeholder="Search" on:input={inputChange} />
    <div class="spacing" />
    <!-- <Link to="/images/live">Live</Link> -->
    <Button on:click={() => (live = true)}>Live</Button>
</div>

<div class="grid">
    {#each paginated as img (img.id)}
        <div id={`img_${img.id}`}>
            <ImageDisplay {img} onClick={() => openImage(img)} />
        </div>
    {/each}
</div>

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
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        grid-gap: 1em;
    }

    .stats {
        position: absolute;
        display: flex;
        justify-content: space-around;
        align-items: center;
        width: calc(100% - var(--main-padding) * 2.5);
        transform: translateY(-130%);
        font-family: "Open sans", sans-serif;
        font-size: 0.8em;
        color: #ddd;
        margin-bottom: 1em;
    }

    select {
        // appearance: none;
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
            // border-radius: 0;
        }
    }

    .nav {
        display: flex;
        gap: 0.5em;
        margin-bottom: 1em;

        .spacing {
            flex-grow: 1;
        }
    }

    .slideshow {
        position: fixed;
        top: 1.5em;
        right: 2em;
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
</style>
