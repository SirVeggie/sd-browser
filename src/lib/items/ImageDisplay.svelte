<script lang="ts">
    import type { InputEvent } from "$lib/types/misc";
    import Clickable from "./Clickable.svelte";
    import { cx } from "$lib/tools/cx";
    import { SpinLine } from "svelte-loading-spinners";
    import { animatedThumb, thumbMode } from "$lib/stores/searchStore";
    import {
        getPreviewParam,
        getQualityParam,
    } from "$lib/requests/imageRequests";
    import { seamlessStyle } from "$lib/stores/styleStore";
    import type { ClientImage } from "$lib/types/images";

    export let img: ClientImage;
    export let onClick:
        | ((e: MouseEvent | KeyboardEvent) => void)
        | undefined
        | false = undefined;
    export let onContext: ((e: InputEvent) => void) | undefined | false =
        undefined;
    export let unselect = false;
    export let onLoaded: (() => void) | undefined = undefined;

    let hasLoaded = false;
    let imgElement: HTMLImageElement | undefined;
    let videoElement: HTMLVideoElement | undefined;

    function markLoaded() {
        if (hasLoaded) return;
        hasLoaded = true;
        onLoaded?.();
    }

    function checkAlreadyLoaded() {
        if (imgElement?.complete && imgElement.naturalWidth > 0) {
            markLoaded();
        } else if (videoElement && videoElement.readyState >= 2) {
            markLoaded();
        }
    }

    $: src = `${img.url}?${getQualityParam($thumbMode)}&defer=true&${getPreviewParam(img.type, $animatedThumb)}`;
    $: active = !!onClick;
    $: seamless = $seamlessStyle;
    $: hasDimensions = !!(img.width && img.height);
    $: containerStyle = hasDimensions
        ? `aspect-ratio: ${img.width} / ${img.height}`
        : undefined;
    $: {
        src;
        hasLoaded = false;
    }
    $: src, imgElement, videoElement, checkAlreadyLoaded();
</script>

<div
    class="base"
    class:active
    class:seamless
    class:unselect
    class:has-dimensions={hasDimensions}
    class:loaded={hasLoaded}
    style={containerStyle}
>
    <Clickable up={onClick} contextMenu={onContext}>
        {#if !hasLoaded}
            <div class="loading">
                <SpinLine color="#444" />
            </div>
        {/if}
        {#if img.type === "video" && $animatedThumb}
            <!-- svelte-ignore a11y-media-has-caption -->
            <video
                bind:this={videoElement}
                autoplay
                loop
                muted
                preload="metadata"
                class={cx(!hasLoaded && "hidden")}
                width={hasDimensions ? img.width : undefined}
                height={hasDimensions ? img.height : undefined}
                on:canplay={markLoaded}
                on:error={markLoaded}
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
                on:load={markLoaded}
                on:error={markLoaded}
            />
        {/if}
    </Clickable>
</div>

<style lang="scss">
    .base {
        font-family: "Open sans", sans-serif;
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
            outline 0.4s ease;
        outline: 1px solid transparent;
        user-select: none;

        img,
        video {
            width: 100%;
            display: block;
            transition:
                transform 0.4s ease,
                opacity 0.4s ease;

            &.hidden {
                opacity: 0;
                position: absolute;
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

        &.active:hover,
        &.active:has(:focus-visible) {
            outline: 1px solid #fffa;

            &:not(.seamless) {
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

    .unselect {
        filter: grayscale(0.8) opacity(0.5);
    }

    .loading {
        color: #ddd;
        font-weight: bold;
        transition: opacity 0.4s ease;
    }
</style>
