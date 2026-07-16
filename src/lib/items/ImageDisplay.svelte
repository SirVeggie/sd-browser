<script lang="ts">
    import { onDestroy } from "svelte";
    import type { InputEvent } from "$lib/types/misc";
    import Clickable from "./Clickable.svelte";
    import ImageLoadingPlaceholder from "./ImageLoadingPlaceholder.svelte";
    import { cx } from "$lib/tools/cx";
    import { animatedThumb, thumbMode, useSmartSubsampling } from "$lib/stores/searchStore";
    import {
        buildImageQueryParams,
        getPreviewParam,
    } from "$lib/requests/imageRequests";
    import { imageSpacing } from "$lib/stores/styleStore";
    import type { ClientImage } from "$lib/types/images";

    export let img: ClientImage;
    export let onClick:
        | ((e: MouseEvent | KeyboardEvent) => void)
        | undefined
        | false = undefined;
    export let onContext: ((e: InputEvent) => void) | undefined | false =
        undefined;
    export let selected = false;
    export let loadSession = 0;
    export let onLoaded: (() => void) | undefined = undefined;
    export let shimmerIndex: number | undefined = undefined;

    let hasLoaded = false;
    let imgElement: HTMLImageElement | undefined;
    let videoElement: HTMLVideoElement | undefined;
    let loadingSrc = "";
    let reportedLoadKey = "";
    let placeholderVisible = true;
    let placeholderLeaving = false;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;

    const placeholderFadeMs = 90;

    function clearRevealTimer() {
        if (!revealTimer) return;
        clearTimeout(revealTimer);
        revealTimer = undefined;
    }

    function prefersReducedMotion() {
        return typeof window !== "undefined"
            && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function resetReveal(nextSrc: string) {
        clearRevealTimer();
        loadingSrc = nextSrc;
        hasLoaded = false;
        placeholderVisible = !!nextSrc;
        placeholderLeaving = false;
    }

    function revealLoadedMedia(expectedSrc: string) {
        if (src !== expectedSrc) return;
        placeholderVisible = false;
        placeholderLeaving = false;
        hasLoaded = true;
    }

    function startReveal(expectedSrc: string) {
        if (src !== expectedSrc || hasLoaded) return;
        if (!placeholderVisible || prefersReducedMotion()) {
            revealLoadedMedia(expectedSrc);
            return;
        }

        clearRevealTimer();
        placeholderLeaving = true;
        revealTimer = setTimeout(() => {
            revealTimer = undefined;
            revealLoadedMedia(expectedSrc);
        }, placeholderFadeMs);
    }

    function markLoaded(expectedSrc: string) {
        if (src !== expectedSrc) return;
        startReveal(expectedSrc);

        const loadKey = `${loadSession}:${expectedSrc}`;
        if (reportedLoadKey === loadKey) return;
        reportedLoadKey = loadKey;
        onLoaded?.();
    }

    function createMediaReadyHandler(expectedSrc: string) {
        return () => {
            markLoaded(expectedSrc);
        };
    }

    function createImageReadyHandler(expectedSrc: string) {
        return async (event: Event) => {
            const element = event.currentTarget;
            if (!(element instanceof HTMLImageElement)) return;

            try {
                await element.decode();
            } catch {
                // A loaded image may reject decode for browser-specific reasons; still reveal it.
            }
            markLoaded(expectedSrc);
        };
    }

    function checkAlreadyLoaded() {
        if (imgElement?.complete && imgElement.naturalWidth > 0) {
            markLoaded(src);
        } else if (videoElement && videoElement.readyState >= 2) {
            markLoaded(src);
        }
    }

    $: src = `${img.url}?${buildImageQueryParams($thumbMode, $useSmartSubsampling, `defer=true&${getPreviewParam(img.type, $animatedThumb)}`)}`;
    $: active = !!onClick;
    $: spacingCompact = $imageSpacing === "compact";
    $: spacingMosaic = $imageSpacing === "mosaic";
    $: hasDimensions = !!(img.width && img.height);
    $: containerStyle = hasDimensions
        ? `aspect-ratio: ${img.width} / ${img.height}`
        : undefined;
    $: if (src !== loadingSrc) resetReveal(src);
    $: loadSession, src, imgElement, videoElement, checkAlreadyLoaded();

    onDestroy(clearRevealTimer);
</script>

<div
    class="base"
    class:active
    class:spacing-compact={spacingCompact}
    class:spacing-mosaic={spacingMosaic}
    class:selected
    class:has-dimensions={hasDimensions}
    class:loaded={hasLoaded}
    style={containerStyle}
>
    <Clickable up={onClick} contextMenu={onContext}>
        {#if placeholderVisible}
            <div class="loading" class:leaving={placeholderLeaving}>
                <ImageLoadingPlaceholder {shimmerIndex} mosaic={spacingMosaic} />
            </div>
        {:else if hasLoaded}
            <div class="overlay"/>
        {/if}
        {#if img.type === "video" && $animatedThumb}
            <video
                bind:this={videoElement}
                autoplay
                loop
                muted
                preload="metadata"
                class={cx(!hasLoaded && "hidden")}
                width={hasDimensions ? img.width : undefined}
                height={hasDimensions ? img.height : undefined}
                on:canplay={createMediaReadyHandler(src)}
                on:error={createMediaReadyHandler(src)}
            >
                <source {src} type="video/mp4" />
            </video>
        {:else}
            <img
                bind:this={imgElement}
                class={cx(!hasLoaded && "hidden")}
                {src}
                alt={img.id}
                width={hasDimensions ? img.width : undefined}
                height={hasDimensions ? img.height : undefined}
                decoding="async"
                fetchpriority="low"
                on:load={createImageReadyHandler(src)}
                on:error={createMediaReadyHandler(src)}
            />
        {/if}
    </Clickable>
</div>

<style lang="scss">
    $accent-blue: rgb(63, 187, 236);
    $accent-glow: rgba(63, 187, 236, 0.45);
    $accent-glow-soft: rgba(63, 187, 236, 0.2);

    .base {
        position: relative;
        display: block;
        background-color: #333;
        color: #ddd;
        border-radius: 0.5em;
        box-shadow: 0px 3px 5px #0005;
        overflow: hidden;
        box-sizing: border-box;
        transition:
            transform 0.4s ease,
            outline 0.4s ease,
            box-shadow 0.4s ease;
        outline: 1px solid transparent;
        user-select: none;

        img,
        video {
            width: 100%;
            display: block;
            transform: scale(1.01);
            transition:
                transform 0.4s ease,
                opacity 180ms ease;

            &.hidden {
                opacity: 0;
                visibility: hidden;
                position: absolute;
            }
        }

        .loading {
            opacity: 1;
            transition: opacity 90ms ease;

            &.leaving {
                opacity: 0;
            }
        }
        
        .overlay {
            position: absolute;
            top: 0; bottom: 0; left: 0; right: 0;
            z-index: 1;
            pointer-events: none;
            display: none;
            box-shadow: inset 0 0 0 0 transparent;
            transition:
                outline 0.4s ease,
                box-shadow 0.4s ease;
        }

        &.selected {
            outline: 2px solid $accent-blue;
            outline-offset: -2px;

            .overlay {
                display: block;
                box-shadow:
                    inset 0 0 14px 2px $accent-glow,
                    inset 0 0 28px 6px $accent-glow-soft;
            }
        }

        &.has-dimensions {
            img,
            video {
                height: 100%;
                object-fit: contain;

                &.hidden {
                    inset: 0;
                }
            }

            .loading {
                position: absolute;
                inset: 0;
                display: flex;
                justify-content: center;
                align-items: center;
            }
        }

        &:not(.has-dimensions) {
            .loading {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 20em;
                width: 100%;
            }

            &.loaded img,
            &.loaded video {
                height: auto;
                position: static;
                opacity: 1;
            }
        }

        &.spacing-mosaic {
            border-radius: 0;
            box-shadow: none;
            background-color: transparent;
            outline-offset: -1px;
            
            &.active:hover:not(.selected) {
                outline: 1px solid transparent;

                .overlay {
                    outline: 1px solid white;
                }
            }

            .overlay {
                display: block;
                outline: 1px solid transparent;
                outline-offset: -1px;
            }

            &.selected {
                outline: 2px solid $accent-blue;

                .overlay {
                    outline: 2px solid $accent-blue;
                }
            }
        }

        &.active:hover,
        &.active:has(:focus-visible) {
            outline: 1px solid #fffa;

            &:not(.spacing-compact):not(.spacing-mosaic) {
                @media (width > 500px) {
                    transform: translateY(-0.5em);
                }
            }

            & img,
            & video {
                transform: scale(1.1) translateY(-0.5em);
            }
        }

        &.active img,
        &.active video {
            cursor: pointer;

            &:hover {
                transform: scale(1.1) translateY(-0.5em);
            }
        }
    }
</style>
