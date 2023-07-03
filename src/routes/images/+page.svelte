<script lang="ts">
    import NavArrows from "$lib/components/NavArrows.svelte";
    import ImageDisplay from "$lib/items/ImageDisplay.svelte";
    import ImageFull from "$lib/items/ImageFull.svelte";
    import Input from "$lib/items/Input.svelte";
    import Intersecter from "$lib/items/Intersecter.svelte";
    import Link from "$lib/items/Link.svelte";
    import { imageStore } from "$lib/stores/imageStore";
    import type { ImageContainer } from "$lib/types";

    let imageAmount = 10;
    let id = "";
    let input = "";

    $: images = Object.keys($imageStore).map((key) => $imageStore[key]);
    $: filtered = [...images].reverse().filter((img) => {
        try {
            return img.metadata.parameters?.toLowerCase().match(input) ?? !input;
        } catch {
            return false;
        }
    });
    $: paginated = filtered.slice(0, imageAmount);
    $: prevIndex = !id ? -1 : paginated.findIndex((img) => img.id === id) - 1;
    $: nextIndex = !id ? -1 : paginated.findIndex((img) => img.id === id) + 1;
    $: leftArrow = prevIndex >= 0;
    $: rightArrow = nextIndex >= 0 && nextIndex < paginated.length;

    function openImage(img: ImageContainer) {
        // notify(`Opened ${img.id}`);
        id = img.id;
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
        imageAmount = 10;
    }

    function loadMore() {
        imageAmount += 10;
    }
</script>

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
        {#if paginated.length === filtered.length}
            <p>You've reached the end.</p>
        {:else}
            <button on:click={loadMore}>
                (click here to load more images)
            </button>
        {/if}
    </Intersecter>
    <div class="spacer" />
</div>

<ImageFull enabled={!!id} img={$imageStore[id]} cancel={() => (id = "")} />
<NavArrows
    onLeft={goLeft}
    onRight={goRight}
    left={leftArrow}
    right={rightArrow}
/>

<style lang="scss">
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        grid-gap: 1em;
    }

    .nav {
        display: flex;
        gap: 0.5em;
        margin-bottom: 1em;

        .spacing {
            flex-grow: 1;
        }
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

    .spacer {
        height: 100px;
        // background-color: red;
    }
</style>
