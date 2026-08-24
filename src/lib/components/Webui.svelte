<script lang="ts">
    import {
        flyoutButton,
        flyoutButtonTop,
        flyoutCustomDragWidth,
        flyoutState,
        flyoutStore,
    } from '$lib/stores/flyoutStore';
    import {
        flyoutTabStore,
        svgenOpenImageRequest,
        svgenUiStore,
        svgenUseParamsRequest,
    } from '$lib/svgen/stores';
    import { sdBrowserPickerStore } from '$lib/svgen/sdBrowserPickerStore';
    import SvGenPanel from '$lib/svgen/components/SvGenPanel.svelte';
    import SvGenSdBrowserImageModal from '$lib/svgen/components/SvGenSdBrowserImageModal.svelte';
    import {
        clampFlyoutCustomWidth,
        resolvedFlyoutCustomWidth,
        shouldPersistFlyoutCustomWidth,
    } from '$lib/tools/flyoutWidth';
    import { browser } from '$app/environment';
    import { onDestroy } from 'svelte';

    let iframe: HTMLIFrameElement;
    let genPanel: SvGenPanel;
    let handleEl: HTMLButtonElement | undefined;
    let dragging = false;
    let dragPointerId: number | null = null;
    let dragStartX = 0;
    let dragStartWidth = 0;

    $: webuiAvailable = $flyoutStore.enabled && !!$flyoutStore.url?.trim();
    $: genAvailable = $svgenUiStore.enabled;
    $: flyoutAvailable = webuiAvailable || genAvailable;
    $: showTabs = webuiAvailable && genAvailable;
    $: disabled = !$flyoutState || !flyoutAvailable;
    $: isTop = $flyoutButtonTop;
    $: customResize = !disabled && $flyoutStore.mode === 'custom';

    $: if ($svgenOpenImageRequest && genPanel) {
        const imageId = $svgenOpenImageRequest;
        svgenOpenImageRequest.set(null);
        flyoutState.set(true);
        flyoutTabStore.set('generate');
        void genPanel.openImage(imageId);
    }

    $: if ($svgenUseParamsRequest && genPanel) {
        const imageId = $svgenUseParamsRequest;
        svgenUseParamsRequest.set(null);
        flyoutState.set(true);
        flyoutTabStore.set('generate');
        void genPanel.useParamsFromImage(imageId);
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

    function viewportWidth() {
        return browser ? window.innerWidth : 1280;
    }

    function displayedCustomWidth() {
        return clampFlyoutCustomWidth(
            $flyoutCustomDragWidth ??
                resolvedFlyoutCustomWidth($flyoutStore.customWidth),
            viewportWidth(),
        );
    }

    function applyLiveWidth(px: number) {
        const next = Math.round(clampFlyoutCustomWidth(px, viewportWidth()));
        flyoutCustomDragWidth.set(next);
        const main = document.querySelector('main');
        if (main instanceof HTMLElement)
            main.style.setProperty('--flyout-width', `${next}px`);
    }

    function stopCustomResizeListeners() {
        if (!browser)
            return;
        window.removeEventListener('pointermove', onCustomResizeMove);
        window.removeEventListener('pointerup', endCustomResize);
        window.removeEventListener('pointercancel', endCustomResize);
    }

    function cancelCustomResize() {
        dragging = false;
        dragPointerId = null;
        stopCustomResizeListeners();
        flyoutCustomDragWidth.set(null);
    }

    function endCustomResize(event: PointerEvent) {
        if (!dragging || event.pointerId !== dragPointerId)
            return;

        const next = displayedCustomWidth();
        const saved = $flyoutStore.customWidth;
        if (shouldPersistFlyoutCustomWidth(saved, next, viewportWidth())) {
            flyoutStore.update((store) => ({ ...store, customWidth: next }));
        }

        try {
            handleEl?.releasePointerCapture(event.pointerId);
        } catch {
            /* capture may already be released */
        }
        cancelCustomResize();
    }

    function onCustomResizeMove(event: PointerEvent) {
        if (!dragging || event.pointerId !== dragPointerId)
            return;
        event.preventDefault();
        const delta = dragStartX - event.clientX;
        applyLiveWidth(dragStartWidth + delta);
    }

    function startCustomResize(event: PointerEvent) {
        if (event.button !== 0)
            return;
        event.preventDefault();
        dragging = true;
        dragPointerId = event.pointerId;
        dragStartX = event.clientX;
        dragStartWidth = displayedCustomWidth();
        applyLiveWidth(dragStartWidth);
        try {
            handleEl?.setPointerCapture(event.pointerId);
        } catch {
            /* capture can fail; window listeners still track the gesture */
        }
        if (!browser)
            return;
        window.addEventListener('pointermove', onCustomResizeMove);
        window.addEventListener('pointerup', endCustomResize);
        window.addEventListener('pointercancel', endCustomResize);
    }

    $: if (!customResize && dragging)
        cancelCustomResize();

    onDestroy(() => {
        cancelCustomResize();
    });
</script>

<div class="flyout no-scrollbar" class:disabled class:dragging>
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

    {#if customResize}
        <button
            bind:this={handleEl}
            type="button"
            class="resize-handle"
            class:dragging
            tabindex="-1"
            aria-label="Resize flyout"
            on:pointerdown={startCustomResize}
        />
    {/if}
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

        &.dragging {
            user-select: none;

            iframe {
                pointer-events: none;
            }
        }
    }

    .resize-handle {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 16px;
        transform: translateX(-50%);
        z-index: 60;
        margin: 0;
        padding: 0;
        border: 0;
        appearance: none;
        display: block;
        background: transparent;
        min-width: 0;
        min-height: 0;
        cursor: ew-resize;
        touch-action: none;
        user-select: none;
        outline: none;

        &::before {
            content: "";
            position: absolute;
            top: 0;
            bottom: 0;
            left: 50%;
            width: 2px;
            transform: translateX(-50%);
            background: var(--accent);
            opacity: 0;
            pointer-events: none;
        }

        @media (hover: hover) and (pointer: fine) {
            &:hover::before {
                opacity: 1;
            }
        }

        &.dragging::before {
            opacity: 1;
        }
    }

    .tabs {
        display: flex;
        gap: 0.25rem;
        padding: 0.4rem 0.5rem;
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

        :global(.flanimate):not(:global(.flresizing)) & {
            transition: right 0.2s ease;
        }

        svg.flip {
            transform: scaleX(-1);
        }
    }
</style>
