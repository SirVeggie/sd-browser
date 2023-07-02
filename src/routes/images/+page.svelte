<script lang="ts">
    import { page } from "$app/stores";
    import { notify } from "$lib/components/Notifier.svelte";
    import ImageDisplay from "$lib/items/ImageDisplay.svelte";
    import ImageFull from "$lib/items/ImageFull.svelte";
    import Intersecter from "$lib/items/Intersecter.svelte";
    import Link from "$lib/items/Link.svelte";
    import { imageStore } from "$lib/stores/imageStore";
    import type { ImageContainer } from "$lib/types";

    let imageAmount = 10;
    $: images = Object.keys($imageStore).map((key) => $imageStore[key]);
    $: reversed = [...images].reverse();
    $: filtered = reversed.slice(0, imageAmount);
    // $: filtered = images.slice(0, imageAmount);
    let id = "";

    function openImage(img: ImageContainer) {
        // notify(`Opened ${img.id}`);
        id = img.id;
    }

    function loadMore() {
        imageAmount += 10;
    }
</script>

<div class="nav">
    <Link to="/">Back</Link>
    <div class="spacing" />
    <Link to="/images/live">Live</Link>
</div>

<div class="grid">
    {#each filtered as img (img.id)}
        <div>
            <ImageDisplay {img} onClick={() => openImage(img)} />
        </div>
    {/each}
</div>

<div class="loader">
    <Intersecter onVisible={loadMore}>
        <h1>Loading...</h1>
    </Intersecter>
</div>

<ImageFull enabled={!!id} img={$imageStore[id]} cancel={() => (id = "")} />

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
        h1 {
            font-family: "Open sans", sans-serif;
            font-size: 2em;
            color: #ddd;
        }
    }
</style>
