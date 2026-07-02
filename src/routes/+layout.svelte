<script lang="ts">
    import "../global.css";
    import Webui from "$lib/components/Webui.svelte";
    import { flyoutState, flyoutStore } from "$lib/stores/flyoutStore";
    import Notifier from "../lib/components/Notifier.svelte";
    import { assets } from "$app/paths";
    import { fullscreenState } from "$lib/stores/fullscreenStore";
    import ContextMenuManager from "$lib/items/ContextMenuManager.svelte";
    import Confirm from "$lib/components/Confirm.svelte";
    import { authStore } from "$lib/stores/authStore";
    import { get } from "svelte/store";
    import Login from "$lib/components/Login.svelte";
    import { attemptLogin } from "$lib/requests/authRequests";
    import OperationProgress from "$lib/components/OperationProgress.svelte";
    import { getOperations } from "$lib/requests/operationRequests";
    import { operationStore } from "$lib/stores/operationStore";
    import { onDestroy, onMount } from "svelte";

    let operationInterval: ReturnType<typeof setInterval> | undefined;

    let timestamp = Date.now();
    let fltimeout: any;
    let flanimate = false;
    $: flwide = $flyoutStore.mode === "wide";
    $: flhalf = $flyoutStore.mode === "half";
    $: flfull = $flyoutStore.mode === "fullscreen";

    $: flvisible = $flyoutState && $flyoutStore.enabled;
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

        operationInterval = setInterval(async () => {
            if (!get(authStore).valid)
                return;
            operationStore.set(await getOperations());
        }, 1000);
    });

    onDestroy(() => {
        if (operationInterval)
            clearInterval(operationInterval);
    });
</script>

<svelte:head>
    <title>SD Browser</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400&family=Source+Sans+3:wght@400&display=swap"
        rel="stylesheet"
    />
    {#if $fullscreenState}
        <link rel="manifest" href={`${assets}/manifest2.json`} />
    {:else}
        <link rel="manifest" href={`${assets}/manifest.json`} />
    {/if}
</svelte:head>

<main class:flvisible class:flanimate class:flwide class:flhalf class:flfull>
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
    {#if $flyoutStore.enabled}
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
        background-color: #242424;
        box-sizing: border-box;
        color: #ddd;

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

            &:not(.flwide, .flfull) {
                @media (width < 1000px) {
                    --flyout-width: 50dvw;
                }
                @media (width < 650px) {
                    --flyout-width: 100%;
                    --content-width: 100%;
                    --flyout-button-reset: 0;
                }
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

        &:global(.flanimate) .content {
            transition: width 0.2s ease;
        }
    }
</style>
