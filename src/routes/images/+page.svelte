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
    import { sleep } from "$lib/tools/sleep";
    import type { ClientImage, ImageInfo } from "$lib/types";
    import { onDestroy } from "svelte";
    import { fade } from "svelte/transition";

    const increment = 20;
    let currentAmount = increment;
    let id = "";
    let input = "";
    let info: ImageInfo | undefined = undefined;
    let timer: any;

    $: paginated = $imageStore.slice(0, currentAmount);
    $: prevIndex = !id ? -1 : paginated.findIndex((img) => img.id === id) - 1;
    $: nextIndex = !id ? -1 : paginated.findIndex((img) => img.id === id) + 1;
    $: leftArrow = prevIndex >= 0;
    $: rightArrow = nextIndex >= 0 && nextIndex < paginated.length;

    onDestroy(() => {
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
        if (timer) {
            clearInterval(timer);
            timer = undefined;
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

    let inputTimer: any;
    async function inputChange() {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            applyInput();
        }, 1000);
    }

    function applyInput() {
        if (!validRegex(input)) return;
        currentAmount = increment;

        searchImages({
            search: input,
        }).then((images) => {
            imageStore.set(mapImagesToClient(images.imageIds));
            imageAmountStore.set(images.amount);
        });
    }

    function loadMore() {
        currentAmount += increment;
    }

    function startSlideshow() {
        timer = setInterval(() => {
            console.log("next image");
            goRight();
        }, 5000);
        notify("Slideshow started");
    }
</script>

<div class="stats">
    Images found: {$imageAmountStore}
</div>

<div class="nav">
    <Link to="/">Back</Link>
    <div class="spacing" />
    <Input bind:value={input} placeholder="Search" on:input={inputChange} />
    <div class="spacing" />
    <Link to="/images/live">Live</Link>
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

<ImageFull enabled={!!id} imageId={id} data={info} cancel={closeImage} />

<NavArrows
    onLeft={goLeft}
    onRight={goRight}
    left={leftArrow}
    right={rightArrow}
/>

{#if id && !timer}
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
        transform: translate(80%, -150%);
        font-family: "Open sans", sans-serif;
        font-size: 0.8em;
        color: #ddd;
        margin-bottom: 1em;
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
