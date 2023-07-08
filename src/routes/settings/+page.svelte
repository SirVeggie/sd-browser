<script lang="ts">
    import Input from "$lib/items/Input.svelte";
    import { onDestroy } from "svelte";
    import Link from "../../lib/items/Link.svelte";
    import { flyoutStore } from "$lib/stores/flyoutStore";
    import Button from "$lib/items/Button.svelte";
    import { cx } from "$lib/tools/cx";
    import { notify } from "$lib/components/Notifier.svelte";
    import { folderFilter, nsfwFilter } from "$lib/stores/searchStore";

    let inputTimer: any;
    let address = $flyoutStore.url;
    let nsfw = $nsfwFilter;
    let folders = $folderFilter;

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

    onDestroy(() => {
        clearTimeout(inputTimer);
        inputTimer = undefined;
    });
</script>

<div class="container">
    <div class="buttons">
        <Link to="/">Back</Link>
        <Button
            class={cx(!$flyoutStore.enabled && "disabled")}
            on:click={toggleFlyout}>Flyout</Button
        >
    </div>

    <p>Set flyout address (webui url)</p>
    <Input bind:value={address} on:input={onInput} />
    <p>Folder filter</p>
    <Input bind:value={folders} on:input={() => folderFilter.set(folders)} />
    <p>NSFW filter</p>
    <Input bind:value={nsfw} on:input={() => nsfwFilter.set(nsfw)} />
</div>

<style lang="scss">
    .container {
        padding: var(--main-padding);
    }
    
    .buttons :global(.disabled) {
        opacity: 0.5;
        filter: grayscale(1);
    }

    p {
        font-family: "Open sans", sans-serif;
        color: #ddd;
        margin: 2em 0.3em 0.2em;
        // margin-top: 1em;
        padding: 0;
    }
</style>
