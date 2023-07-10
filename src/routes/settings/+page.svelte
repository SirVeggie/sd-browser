<script lang="ts">
    import Input from "$lib/items/Input.svelte";
    import { onDestroy } from "svelte";
    import Link from "../../lib/items/Link.svelte";
    import { flyoutStore } from "$lib/stores/flyoutStore";
    import Button from "$lib/items/Button.svelte";
    import { cx } from "$lib/tools/cx";
    import { notify } from "$lib/components/Notifier.svelte";
    import {
        compressedMode,
        folderFilter,
        matchingMode,
        nsfwFilter,
        thumbMode,
    } from "$lib/stores/searchStore";
    import { qualityModes, searchModes } from "$lib/types";

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

    function toggleFlyout() {
        flyoutStore.update((x) => ({ ...x, enabled: !x.enabled }));
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
        <Button
            class={cx(!$flyoutStore.enabled && "disabled")}
            on:click={toggleFlyout}>Flyout</Button
        >
    </div>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Set flyout address (webui url)
        <Input bind:value={address} on:input={onInput} />
    </label>
    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Folder filter
        <Input bind:value={$folderFilter} />
    </label>
    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        NSFW filter
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
</div>

<style lang="scss">
    .container {
        padding: var(--main-padding);
        display: flex;
        flex-direction: column;
        gap: 2em;
    }

    .buttons :global(.disabled) {
        opacity: 0.5;
        filter: grayscale(1);
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
