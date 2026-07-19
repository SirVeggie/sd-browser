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
    const THUMB_GAP = 8;
    /** Gap between `.thumbs` and `.clear-btn` on `.ref-strip`. */
    const CLEAR_GAP = 5;
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

        const thumbStep = THUMB_SIZE + THUMB_GAP;
        const clearReserve = CLEAR_BTN_WIDTH + CLEAR_GAP;

        let available = width - clearReserve;
        let fit = Math.floor((available + THUMB_GAP) / thumbStep);
        if (fit >= total) {
            return total;
        }

        // Overflow chip sits in `.thumbs`, so it needs a thumb-gap before it.
        available = width - clearReserve - OVERFLOW_BTN_WIDTH - THUMB_GAP;
        fit = Math.floor((available + THUMB_GAP) / thumbStep);
        return Math.max(1, Math.min(fit, total - 1));
    }

    /** Measure the dock (parent), not the fit-content strip — otherwise collapse feeds on itself. */
    const observeAvailableWidth: Action<HTMLDivElement> = (node) => {
        const readWidth = () => {
            const parent = node.parentElement;
            if (!parent) {
                containerWidth = 0;
                return;
            }
            const style = getComputedStyle(node);
            const pad =
                (parseFloat(style.paddingLeft) || 0) +
                (parseFloat(style.paddingRight) || 0);
            containerWidth = Math.max(0, parent.clientWidth - pad);
        };

        const parent = node.parentElement;
        const observer = new ResizeObserver(readWidth);
        if (parent) {
            observer.observe(parent);
        }
        observer.observe(node);
        readWidth();

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
        return `/api/images/${id}?${buildImageQueryParams($thumbMode, extra)}`;
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
    <div class="ref-strip" use:observeAvailableWidth>
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
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 5px;
        width: fit-content;
        max-width: 100%;
        overflow: visible;
        padding: 0.35rem 0.45rem;
        border-radius: 12px;
        background: var(--glass);
        backdrop-filter: blur(16px) saturate(1.2);
        border: 1px solid var(--line);
        box-shadow:
            0 0 16px rgba(0, 0, 0, 0.48),
            0 0 36px rgba(0, 0, 0, 0.58),
            0 0 72px rgba(0, 0, 0, 0.5);
        min-width: 0;
        box-sizing: border-box;
        position: relative;
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
        box-sizing: border-box;
        width: 40px;
        height: 40px;
        border-radius: 6px;
        overflow: hidden;
        background: #241f1a;
        flex-shrink: 0;
        border: 1px solid var(--line);
        transition: box-shadow 0.15s ease, transform 0.12s ease;

        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        &:hover {
            box-shadow: 0 0 0 1px rgba(196, 165, 116, 0.35);
            transform: translateY(-1px);
        }
    }

    .badge {
        position: absolute;
        top: 0;
        left: 0;
        padding: 0.1em 0.3em 0.12em;
        font-size: 0.58rem;
        font-weight: 600;
        line-height: 1.25;
        letter-spacing: 0.02em;
        color: var(--ink);
        background: rgba(0, 0, 0, 0.72);
        border-bottom-right-radius: 0.35em;
        pointer-events: none;
        user-select: none;
    }

    .overflow-wrap {
        position: relative;
        flex-shrink: 0;
    }

    .overflow-btn {
        box-sizing: border-box;
        width: 40px;
        height: 40px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.25);
        color: var(--muted);
        font-size: 0.7rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(196, 165, 116, 0.35);
            color: var(--ink);
        }
    }

    .overflow-panel {
        position: absolute;
        bottom: calc(100% + 6px);
        left: 0;
        z-index: 30;
        display: flex;
        flex-wrap: wrap;
        gap: 0.4em;
        padding: 0.45em;
        min-width: 40px;
        max-width: min(240px, 70vw);
        background: var(--bg-elev);
        border: none;
        border-radius: 0.4em;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        max-height: min(280px, 50vh);
        overflow-y: auto;
        @include dropdown.panel-animation-up;
        @include dropdown.reduced-motion;
    }

    .overflow-item {
        display: block;
    }

    .clear-btn {
        box-sizing: border-box;
        flex-shrink: 0;
        width: 32px;
        height: 40px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.25);
        color: var(--muted);
        font-size: 0.7rem;
        line-height: 1;
        cursor: pointer;
        transition: color 0.12s ease, background 0.12s ease;

        &:hover {
            color: var(--danger);
            background: rgba(196, 122, 106, 0.12);
        }
    }

    :global(.ref-strip .clickable) {
        width: auto;
        height: auto;
    }
</style>
