<script lang="ts">
    import ImageRefPreviewModal from "$lib/components/ImageRefPreviewModal.svelte";
    import Clickable from "$lib/items/Clickable.svelte";
    import {
        buildImageQueryParams,
        getPreviewParam,
    } from "$lib/requests/imageRequests";
    import {
        animatedThumb,
        thumbMode,
        useSmartSubsampling,
    } from "$lib/stores/searchStore";
    import {
        clearImageRefs,
        imageRefs,
        removeImageRef,
        type ImageSearchRef,
    } from "$lib/stores/imageRefStore";
    import { bindDropdownOutsideClick } from "$lib/tools/dropdownOutsideClick";
    import type { Action } from "svelte/action";
    import { onMount } from "svelte";

    const THUMB_SIZE = 40;
    const GAP = 8;
    const OVERFLOW_BTN_WIDTH = 40;
    const CLEAR_BTN_WIDTH = 32;

    let overflowRootEl: HTMLDivElement | undefined;
    let containerWidth = 0;
    let overflowOpen = false;
    let previewRef: ImageSearchRef | undefined;

    $: refs = $imageRefs;
    $: visibleCount = computeVisibleCount(containerWidth, refs.length);
    $: visibleRefs = refs.slice(0, visibleCount);
    $: overflowRefs = refs.slice(visibleCount);

    function computeVisibleCount(width: number, total: number): number {
        if (total === 0) {
            return 0;
        }
        // Until measured, show all — avoids the false "only 1 + overflow" flash.
        if (width <= 0) {
            return total;
        }

        const thumbStep = THUMB_SIZE + GAP;
        const baseControls = CLEAR_BTN_WIDTH + GAP;

        let available = width - baseControls;
        let fit = Math.floor((available + GAP) / thumbStep);
        if (fit >= total) {
            return total;
        }

        available = width - baseControls - OVERFLOW_BTN_WIDTH - GAP;
        fit = Math.floor((available + GAP) / thumbStep);
        return Math.max(1, Math.min(fit, total - 1));
    }

    const observeStripWidth: Action<HTMLDivElement> = (node) => {
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                containerWidth = entry.contentRect.width;
            }
        });
        observer.observe(node);
        containerWidth = node.clientWidth;
        return {
            destroy() {
                observer.disconnect();
            },
        };
    };

    function buildRefThumbUrl(id: string, defer = true): string {
        const extra = defer
            ? `defer=true&${getPreviewParam("image", $animatedThumb)}`
            : getPreviewParam("image", $animatedThumb);
        return `/api/images/${id}?${buildImageQueryParams($thumbMode, $useSmartSubsampling, extra)}`;
    }

    function openPreview(ref: ImageSearchRef) {
        previewRef = ref;
    }

    function closePreview() {
        previewRef = undefined;
    }

    function removePreviewRef() {
        if (!previewRef) {
            return;
        }
        removeRef(previewRef.slot);
    }

    function removeRef(slot: number) {
        removeImageRef(slot);
        if (previewRef?.slot === slot) {
            previewRef = undefined;
        }
    }

    function toggleOverflow() {
        overflowOpen = !overflowOpen;
    }

    onMount(() => {
        const removeOutsideClick = bindDropdownOutsideClick(
            () => overflowOpen,
            () => { overflowOpen = false; },
            () => overflowRootEl,
        );

        return removeOutsideClick;
    });
</script>

{#if refs.length > 0}
    <div class="ref-strip" use:observeStripWidth>
        <div class="thumbs" role="list">
            {#each visibleRefs as ref (ref.slot)}
                <div class="thumb-slot" role="listitem">
                    <Clickable
                        up={() => openPreview(ref)}
                        contextMenu={() => removeRef(ref.slot)}
                    >
                        <div class="thumb" title={`Reference #${ref.slot}`}>
                            <img src={buildRefThumbUrl(ref.id)} alt="" loading="lazy" draggable="false" />
                            <span class="badge">#{ref.slot}</span>
                        </div>
                    </Clickable>
                </div>
            {/each}

            {#if overflowRefs.length > 0}
                <div class="overflow-wrap" bind:this={overflowRootEl}>
                    <button
                        type="button"
                        class="overflow-btn"
                        aria-expanded={overflowOpen}
                        aria-haspopup="menu"
                        title={`${overflowRefs.length} more reference${overflowRefs.length === 1 ? "" : "s"}`}
                        on:click|stopPropagation={toggleOverflow}
                    >
                        +{overflowRefs.length}
                    </button>
                    {#if overflowOpen}
                        <div class="overflow-panel" role="menu">
                            {#each overflowRefs as ref (ref.slot)}
                                <Clickable
                                    up={() => {
                                        overflowOpen = false;
                                        openPreview(ref);
                                    }}
                                    contextMenu={() => removeRef(ref.slot)}
                                >
                                    <div class="overflow-item" role="menuitem">
                                        <div class="thumb">
                                            <img src={buildRefThumbUrl(ref.id)} alt="" loading="lazy" draggable="false" />
                                            <span class="badge">#{ref.slot}</span>
                                        </div>
                                    </div>
                                </Clickable>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>

        <button
            type="button"
            class="clear-btn"
            title="Clear all references"
            aria-label="Clear all references"
            on:click={clearImageRefs}
        >
            ×
        </button>
    </div>
{/if}

{#if previewRef}
    <ImageRefPreviewModal
        ref={previewRef}
        imageUrl={buildRefThumbUrl(previewRef.id, false)}
        onClose={closePreview}
        onRemove={removePreviewRef}
    />
{/if}

<style lang="scss">
    @use "$lib/items/dropdownAnimations.scss" as dropdown;

    .ref-strip {
        display: flex;
        align-items: center;
        gap: 0.75em;
        padding: 0.45em 0 0.55em;
        margin: 0;
        border-top: 1px solid #ffffff0d;
        min-width: 0;
        box-sizing: border-box;
    }

    .thumbs {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
        // Do not clip — the overflow dropdown renders below the strip.
    }

    .thumb-slot {
        flex-shrink: 0;
    }

    .thumb {
        position: relative;
        width: 40px;
        height: 40px;
        border-radius: 0.3em;
        overflow: hidden;
        background: #111;
        flex-shrink: 0;
        box-shadow:
            0 0 0 1px #ffffff14,
            0 2px 6px #0006;
        transition: box-shadow 0.15s ease, transform 0.12s ease;

        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        &:hover {
            box-shadow:
                0 0 0 1px #3e8aa888,
                0 2px 8px #0008;
            transform: translateY(-1px);
        }
    }

    .badge {
        position: absolute;
        top: 0;
        left: 0;
        padding: 0.1em 0.35em 0.15em;
        font-size: 0.62rem;
        font-weight: 600;
        line-height: 1.25;
        letter-spacing: 0.02em;
        color: #f2f6fa;
        background: linear-gradient(
            145deg,
            #0a1620ee 0%,
            #1a4a5ccc 48%,
            #2a7a92aa 100%
        );
        border-bottom-right-radius: 0.35em;
        pointer-events: none;
        user-select: none;
        text-shadow: 0 1px 2px #000a;
    }

    .overflow-wrap {
        position: relative;
        flex-shrink: 0;
    }

    .overflow-btn {
        width: 40px;
        height: 40px;
        border: 1px dashed #ffffff28;
        border-radius: 0.3em;
        background: #ffffff08;
        color: #c8d0d8;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;

        &:hover {
            background: #ffffff12;
            border-color: #3e8aa8aa;
            color: #fff;
        }
    }

    .overflow-panel {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        z-index: 20;
        display: flex;
        flex-wrap: wrap;
        gap: 0.4em;
        padding: 0.45em;
        min-width: 40px;
        max-width: min(240px, 70vw);
        background: #2a2a2af2;
        border: 1px solid #ffffff18;
        border-radius: 0.4em;
        box-shadow: 0 8px 20px #0008;
        max-height: min(280px, 50vh);
        overflow-y: auto;
        @include dropdown.panel-animation;
        @include dropdown.reduced-motion;
    }

    .overflow-item {
        display: block;
    }

    .clear-btn {
        flex-shrink: 0;
        width: 32px;
        height: 40px;
        border: none;
        border-radius: 0.3em;
        background: transparent;
        color: #888;
        font-size: 1.25rem;
        line-height: 1;
        cursor: pointer;
        transition: color 0.12s ease;

        &:hover {
            color: #e07070;
            background: transparent;
        }
    }

    :global(.ref-strip .clickable) {
        width: auto;
        height: auto;
    }
</style>
