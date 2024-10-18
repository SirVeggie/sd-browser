<script lang="ts">
    import type { ClientImage } from "$lib/types";
    import Clickable from "./Clickable.svelte";
    import { cx } from "$lib/tools/cx";
    import { SpinLine } from "svelte-loading-spinners";
    import { animatedThumb, thumbMode } from "$lib/stores/searchStore";
    import { getPreviewParam, getQualityParam } from "$lib/tools/imageRequests";
    import { seamlessStyle } from "$lib/stores/styleStore";

    export let img: ClientImage;
    export let onClick: ((e: MouseEvent | KeyboardEvent) => void) | undefined =
        undefined;
    export let unselect = false;

    let hasLoaded = false;

    $: src = `${img.url}?${getQualityParam($thumbMode)}&defer=true&${getPreviewParam(img.type, $animatedThumb)}`;
    $: active = !!onClick;
    $: seamless = $seamlessStyle;
</script>

<div class="base" class:active class:seamless class:unselect>
    <Clickable up={onClick}>
        {#if !hasLoaded}
            <div class="loading">
                <SpinLine color="#444" />
            </div>
        {/if}
        {#if img.type === "video" && $animatedThumb}
            <!-- svelte-ignore a11y-media-has-caption -->
            <video
                autoplay
                loop
                muted
                preload="metadata"
                class={cx(!hasLoaded && "hidden")}
                on:canplay={() => (hasLoaded = true)}
            >
                <source {src} type="video/mp4" />
            </video>
        {:else}
            <img
                class={cx(!hasLoaded && "hidden")}
                {src}
                alt={img.id}
                on:load={() => (hasLoaded = true)}
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
        pointer-events: none;
    }

    .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 20em;
        width: 100%;
        color: #ddd;
        font-weight: bold;
        transition: opacity 0.4s ease;
    }
</style>
