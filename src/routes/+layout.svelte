<script lang="ts">
    import "../global.css";
    import Webui from "$lib/components/Webui.svelte";
    import { flyoutState, flyoutStore } from "$lib/stores/flyoutStore";
    import Notifier from "../lib/components/Notifier.svelte";
    import { assets } from "$app/paths";
    import { fullscreenState } from "$lib/stores/fullscreenStore";
    import ContextMenu from "$lib/items/ContextMenu.svelte";
    import Confirm from "$lib/components/Confirm.svelte";
    import { authStore } from "$lib/stores/authStore";
    import Login from "$lib/components/Login.svelte";
    import { onMount } from "svelte";
    import { attemptLogin } from "$lib/tools/authRequests";

    let timestamp = Date.now();
    let fltimeout: any;
    let flanimate = false;
    $: flwide = $flyoutStore.mode === "wide";
    $: flhalf = $flyoutStore.mode === "half";
    $: flfull = $flyoutStore.mode === "fullscreen";

    $: flvisible = $flyoutState;
    $: {
        $flyoutState;
        clearTimeout(fltimeout);
        if (timestamp + 1000 < Date.now()) {
            flanimate = true;
        }
        fltimeout = setTimeout(() => {
            flanimate = false;
        }, 250);
    }

    onMount(async () => {
        if (!(await attemptLogin())) {
            authStore.set({
                password: "",
                valid: false,
            });
        }
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

<main class:flvisible class:flanimate class:flwide class:flhalf class:flfull>
    <div class="content">
        {#if $authStore.valid}
            <slot />
        {:else}
            <Login />
        {/if}
    </div>
    {#if $flyoutStore.enabled}
        <Webui />
    {/if}
    <Confirm />
    <ContextMenu />
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
        --content-width: calc(100dvw - var(--flyout-width));

        .content {
            flex-grow: 1;
            position: relative;
            width: var(--content-width);
        }

        &.flvisible {
            --flyout-width: 500px;

            &:not(.flwide, .flfull) {
                @media (width < 1000px) {
                    --flyout-width: 50dvw;
                }
                @media (width < 650px) {
                    --flyout-width: 100dvw;
                    --content-width: 100dvw;
                }
            }

            &.flwide {
                --flyout-width: 1000px;

                @media (width < 2000px) {
                    --flyout-width: 50dvw;
                }
                @media (width < 1000px) {
                    --flyout-width: 100dvw;
                    --content-width: 100dvw;
                }
            }
            
            &.flhalf {
                --flyout-width: 50dvw;
                
                @media (width < 1000px) {
                    --flyout-width: 100dvw;
                    --content-width: 100dvw;
                }
            }

            &.flfull {
                --flyout-width: 100dvw;
                --content-width: 100dvw;
            }
        }

        &:global(.flanimate) .content {
            transition: width 0.2s ease;
        }
    }
</style>
