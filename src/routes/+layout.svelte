<script lang="ts">
    import "../global.css";
    import Webui from "$lib/components/Webui.svelte";
    import { flyoutStore, syncFlyoutWithLocalStorage } from "$lib/stores/flyoutStore";
    import Notifier from "../lib/components/Notifier.svelte";
    import { assets } from "$app/paths";
    import { onMount } from "svelte";
    import { fullscreenState, syncFullscreenWithLocalStorage } from "$lib/stores/fullscreenStore";
    import { syncSearchWithLocalStorage } from "$lib/stores/searchStore";
    import { syncStyleWithLocalStorage } from "$lib/stores/styleStore";

    onMount(() => {
        syncSearchWithLocalStorage();
        syncFlyoutWithLocalStorage();
        syncFullscreenWithLocalStorage();
        syncStyleWithLocalStorage();
    });
</script>

<svelte:head>
    <title>SD Browser</title>
    {#if $fullscreenState}
        <link rel="manifest" href={`${assets}/manifest2.json`} />
    {:else}
        <link rel="manifest" href={`${assets}/manifest.json`} />
    {/if}
</svelte:head>

<main>
    <slot />
    {#if $flyoutStore.enabled}
        <Webui />
    {/if}
    <Notifier />
</main>

<style>
    main {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        min-height: 100dvh;
        background-color: #242424;
        --main-padding: 2em;
        box-sizing: border-box;
        color: #ddd;
    }
</style>
