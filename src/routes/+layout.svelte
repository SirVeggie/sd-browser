<script lang="ts">
    import "../global.css";
    import Webui from "$lib/components/Webui.svelte";
    import { flyoutState, flyoutStore } from "$lib/stores/flyoutStore";
    import Notifier from "../lib/components/Notifier.svelte";
    import { assets } from "$app/paths";
    import { fullscreenState } from "$lib/stores/fullscreenStore";

    let fltimeout: any;
    let flanimate = false;
    
    $: flvisible = $flyoutState;
    // $: style = `--flyout-width: ${$flyoutState ? 500 : 0}px;`;
    $: {
        $flyoutState;
        clearTimeout(fltimeout);
        flanimate = true;
        fltimeout = setTimeout(() => {
            flanimate = false;
        }, 250);
    }
</script>

<svelte:head>
    <title>SD Browser</title>
    {#if $fullscreenState}
        <link rel="manifest" href={`${assets}/manifest2.json`} />
    {:else}
        <link rel="manifest" href={`${assets}/manifest.json`} />
    {/if}
</svelte:head>

<main class:flvisible class:flanimate>
    <div class="content">
        <slot />
    </div>
    {#if $flyoutStore.enabled}
        <Webui />
    {/if}
    <Notifier />
</main>

<style lang="scss">
    main {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        min-height: 100dvh;
        background-color: #242424;
        box-sizing: border-box;
        color: #ddd;

        --main-padding: 2em;
        --flyout-width: 0px;

        .content {
            flex-grow: 1;
            position: relative;
            width: calc(100dvw - var(--flyout-width));
            // container-type: inline-size;
        }
        
        &.flvisible {
            --flyout-width: 500px;
            
            @media (width < 800px) {
                --flyout-width: 350px;
            }
            @media (width < 650px) {
                --flyout-width: 0px;
            }
        }

        &:global(.flanimate) .content {
            transition: width 0.2s ease;
        }
    }
</style>
