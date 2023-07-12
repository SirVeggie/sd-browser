<script lang="ts">
    import Input from "$lib/items/Input.svelte";
    import { onDestroy } from "svelte";
    import Link from "../../lib/items/Link.svelte";
    import { flyoutStore } from "$lib/stores/flyoutStore";
    import Button from "$lib/items/Button.svelte";
    import { notify } from "$lib/components/Notifier.svelte";
    import {
        compressedMode,
        folderFilter,
        matchingMode,
        nsfwFilter,
        thumbMode,
    } from "$lib/stores/searchStore";
    import { qualityModes, searchKeywords, searchModes } from "$lib/types";
    import { fullscreenState } from "$lib/stores/fullscreenStore";
    import { seamlessStyle } from "$lib/stores/styleStore";

    let inputTimer: any;
    let address = $flyoutStore.url;

    $: setInput($flyoutStore.url);

    onDestroy(() => {
        clearTimeout(inputTimer);
        inputTimer = undefined;
    });

    function setInput(value: string) {
        address = value;
    }

    function onInput() {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            flyoutStore.update((x) => ({ ...x, url: address }));
            notify(`Flyout address set to '${address}'`);
        }, 2000);
    }

    function reset() {
        notify(`LocalStorage was cleared`);
        localStorage.clear();
        window.location.reload();
    }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div class="container">
    <div class="buttons">
        <Link to="/">Back</Link>
        <Button on:click={reset}>Reset</Button>
    </div>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Set flyout address (webui url)
        <Input bind:value={address} on:input={onInput} />
    </label>

    <label class="checkbox">
        Flyout enabled:
        <input type="checkbox" bind:checked={$flyoutStore.enabled} />
    </label>

    <div class="gray">
        Search keywords:<br /><span
            >{searchKeywords.join(", ").replaceAll("|", " | ")}</span
        >
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

    <span class="gray">
        Visual style settings
    </span>

    <label class="checkbox">
        Seamless grid:
        <input type="checkbox" bind:checked={$seamlessStyle} />
    </label>

    <span class="gray">
        PWA fullscreen:
        <br />
        Enable this setting before adding to homescreen to disable mobile UI elements
        (status bar, taskbar on tablets)
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
            transition: 120ms transform ease, 120ms opacity ease;
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
