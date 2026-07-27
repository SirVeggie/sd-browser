<script lang="ts">
    import {
        flyoutButton,
        flyoutButtonTop,
        flyoutState,
        flyoutStore,
    } from '$lib/stores/flyoutStore';
    import {
        flyoutTabStore,
        svgenOpenImageRequest,
        svgenUiStore,
    } from '$lib/svgen/stores';
    import { sdBrowserPickerStore } from '$lib/svgen/sdBrowserPickerStore';
    import SvGenPanel from '$lib/svgen/components/SvGenPanel.svelte';
    import SvGenSdBrowserImageModal from '$lib/svgen/components/SvGenSdBrowserImageModal.svelte';

    let iframe: HTMLIFrameElement;
    let genPanel: SvGenPanel;

    $: webuiAvailable = $flyoutStore.enabled && !!$flyoutStore.url?.trim();
    $: genAvailable = $svgenUiStore.enabled;
    $: flyoutAvailable = webuiAvailable || genAvailable;
    $: showTabs = webuiAvailable && genAvailable;
    $: disabled = !$flyoutState || !flyoutAvailable;
    $: isTop = $flyoutButtonTop;

    $: if ($svgenOpenImageRequest && genPanel) {
        const imageId = $svgenOpenImageRequest;
        svgenOpenImageRequest.set(null);
        flyoutState.set(true);
        flyoutTabStore.set('generate');
        void genPanel.openImage(imageId);
    }

    // Keep active tab valid when one mode disappears.
    $: {
        if (showTabs) {
            /* both ok */
        } else if (genAvailable && !webuiAvailable) {
            flyoutTabStore.set('generate');
        } else if (webuiAvailable && !genAvailable) {
            flyoutTabStore.set('webui');
        }
    }

    $: activeTab = showTabs
        ? $flyoutTabStore
        : genAvailable && !webuiAvailable
            ? 'generate'
            : 'webui';

    export function fullscreen() {
        iframe?.requestFullscreen();
    }

    function toggle() {
        flyoutState.set(!$flyoutState);
    }
</script>

<div class="flyout no-scrollbar" class:disabled>
    {#if showTabs}
        <div class="tabs" role="tablist">
            <button
                type="button"
                role="tab"
                class:active={activeTab === 'webui'}
                aria-selected={activeTab === 'webui'}
                on:click={() => flyoutTabStore.set('webui')}
            >
                WebUI
            </button>
            <button
                type="button"
                role="tab"
                class:active={activeTab === 'generate'}
                aria-selected={activeTab === 'generate'}
                on:click={() => flyoutTabStore.set('generate')}
            >
                Generate
            </button>
        </div>
    {/if}

    <div class="body">
        {#if webuiAvailable}
            <div class="pane" class:hidden={activeTab !== 'webui'}>
                <iframe
                    title="sd"
                    bind:this={iframe}
                    src={$flyoutStore.url}
                    frameborder="0"
                    allow="fullscreen; clipboard-write"
                />
            </div>
        {/if}
        {#if genAvailable}
            <div class="pane gen" class:hidden={activeTab !== 'generate'}>
                <SvGenPanel bind:this={genPanel} />
            </div>
        {/if}
    </div>
</div>

{#if $sdBrowserPickerStore}
    {@const pickerSession = $sdBrowserPickerStore}
    <SvGenSdBrowserImageModal session={pickerSession} />
{/if}

{#if $flyoutButton && flyoutAvailable}
    <button type="button" class="toggle" on:click={toggle} class:isTop>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            class:flip={$flyoutState}
        >
            <path
                d="M15 4l-8 8 8 8"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    </button>
{/if}

<style lang="scss">
    .flyout {
        position: fixed;
        top: 0;
        right: 0;
        width: var(--flyout-width);
        bottom: 0;
        z-index: 50;
        display: flex;
        flex-direction: column;
        overscroll-behavior-y: contain;
        background: var(--bg);

        transition:
            opacity 0.2s ease,
            transform 0.2s ease;

        &.disabled {
            opacity: 0;
            pointer-events: none;
            transform: translateX(100%);
        }
    }

    .tabs {
        display: flex;
        gap: 0.25rem;
        padding: 0.4rem 0.5rem;
        border-bottom: 1px solid var(--line);
        flex-shrink: 0;
        background: color-mix(in srgb, var(--bg) 90%, var(--glass));

        button {
            flex: 1;
            appearance: none;
            border: 1px solid transparent;
            border-radius: 8px;
            background: transparent;
            color: inherit;
            padding: 0.35rem 0.5rem;
            font-size: 0.85rem;
            cursor: pointer;
            opacity: 0.7;

            &.active {
                opacity: 1;
                border-color: var(--line);
                background: var(--glass);
                font-weight: 600;
            }
        }
    }

    .body {
        flex: 1;
        min-height: 0;
        position: relative;
    }

    .pane {
        position: absolute;
        inset: 0;
        overflow: hidden;

        &.hidden {
            visibility: hidden;
            pointer-events: none;
        }

        &.gen {
            display: flex;
            flex-direction: column;
        }
    }

    iframe {
        display: block;
        width: 100%;
        height: calc(100% + 1px);
        border: 0;
    }

    .toggle {
        line-height: 0;
        z-index: 99;
        color: var(--ink);
        appearance: none;
        border: 1px solid var(--line);
        background-color: var(--glass);
        backdrop-filter: blur(12px) saturate(1.2);
        border-radius: 14px 0 0 14px;
        border-right: none;
        padding: 15px;
        position: fixed;
        right: calc(var(--flyout-width) * var(--flyout-button-reset));
        cursor: pointer;
        top: auto;
        bottom: 9.5rem;

        &.isTop {
            top: 90px;
            bottom: auto;
        }

        :global(.flanimate) & {
            transition: right 0.2s ease;
        }

        svg.flip {
            transform: scaleX(-1);
        }
    }
</style>
