<script lang="ts">
    import "../global.css";
    import "../scroll.css";
    import Webui from "$lib/components/Webui.svelte";
    import {
        flyoutCustomDragWidth,
        flyoutState,
        flyoutStore,
    } from "$lib/stores/flyoutStore";
    import {
        clampFlyoutCustomWidth,
        resolvedFlyoutCustomWidth,
    } from "$lib/tools/flyoutWidth";
    import { svgenUiStore } from "$lib/svgen/stores";
    import Notifier from "../lib/components/Notifier.svelte";
    import { assets } from "$app/paths";
    import { browser } from "$app/environment";
    import { fullscreenState } from "$lib/stores/fullscreenStore";
    import ContextMenuManager from "$lib/items/ContextMenuManager.svelte";
    import Confirm from "$lib/components/Confirm.svelte";
    import { authStore } from "$lib/stores/authStore";
    import Login from "$lib/components/Login.svelte";
    import { attemptLogin } from "$lib/requests/authRequests";
    import OperationProgress from "$lib/components/OperationProgress.svelte";
    import { onMount } from "svelte";

    let timestamp = Date.now();
    let fltimeout: any;
    let flanimate = false;
    let viewportWidth = browser ? window.innerWidth : 1280;
    $: flwide = $flyoutStore.mode === "wide";
    $: flhalf = $flyoutStore.mode === "half";
    $: flfull = $flyoutStore.mode === "fullscreen";
    $: flcustom = $flyoutStore.mode === "custom";
    $: flresizing = $flyoutCustomDragWidth != null;

    $: webuiAvailable = $flyoutStore.enabled && !!$flyoutStore.url?.trim();
    $: genAvailable = $svgenUiStore.enabled;
    $: flyoutAvailable = webuiAvailable || genAvailable;
    $: flvisible = $flyoutState && flyoutAvailable;
    $: customFlyoutStyle =
        flvisible && flcustom
            ? `--flyout-width: ${clampFlyoutCustomWidth(
                  $flyoutCustomDragWidth ??
                      resolvedFlyoutCustomWidth($flyoutStore.customWidth),
                  viewportWidth,
              )}px`
            : undefined;
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

    function onViewportResize() {
        viewportWidth = window.innerWidth;
    }

    onMount(() => {
        viewportWidth = window.innerWidth;
        window.addEventListener("resize", onViewportResize);
        void (async () => {
            if (!(await attemptLogin())) {
                authStore.set({
                    password: "",
                    valid: false,
                });
            }
        })();
        return () => {
            window.removeEventListener("resize", onViewportResize);
        };
    });
</script>

<svelte:head>
    <title>SD Browser</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Sans+3:wght@400;600&display=swap"
        rel="stylesheet"
    />
    {#if $fullscreenState}
        <link rel="manifest" href={`${assets}/manifest2.json`} />
    {:else}
        <link rel="manifest" href={`${assets}/manifest.json`} />
    {/if}
</svelte:head>

<main
    class:flvisible
    class:flanimate
    class:flwide
    class:flhalf
    class:flfull
    class:flcustom
    class:flresizing
    style={customFlyoutStyle}
>
    {#if $authStore.valid}
        <OperationProgress />
    {/if}
    <div class="content">
        {#if $authStore.valid}
            <slot />
        {:else}
            <Login />
        {/if}
    </div>
    {#if flyoutAvailable}
        <Webui />
    {/if}
    <Confirm />
    <ContextMenuManager />
    <Notifier />
</main>

<style lang="scss">
    main {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        min-height: 100dvh;
        background-color: var(--bg);
        box-sizing: border-box;
        color: var(--ink);

        --main-padding: 2em;
        --flyout-width: 0px;
        --content-width: calc(100% - var(--flyout-width));
        --flyout-button-reset: 1;

        .content {
            flex-grow: 1;
            position: relative;
            width: var(--content-width);
        }

        &.flvisible {
            --flyout-width: 500px;

            &:not(.flwide, .flfull, .flcustom) {
                @media (width < 1000px) {
                    --flyout-width: 50dvw;
                }
                @media (width < 650px) {
                    --flyout-width: 100%;
                    --content-width: 100%;
                    --flyout-button-reset: 0;
                }
            }

            &.flcustom {
                --content-width: calc(100% - var(--flyout-width));
                --flyout-button-reset: 1;
            }

            &.flwide {
                --flyout-width: 1000px;

                @media (width < 2000px) {
                    --flyout-width: 50dvw;
                }
                @media (width < 1000px) {
                    --flyout-width: 100%;
                    --content-width: 100%;
                    --flyout-button-reset: 0;
                }
            }
            
            &.flhalf {
                --flyout-width: 50dvw;
                
                @media (width < 1000px) {
                    --flyout-width: 100%;
                    --content-width: 100%;
                    --flyout-button-reset: 0;
                }
            }
            
            &.flfull {
                --flyout-width: 100%;
                --content-width: 100%;
                --flyout-button-reset: 0;
            }
        }

        &.flanimate:not(.flresizing) .content {
            transition: width 0.2s ease;
        }
    }
</style>
