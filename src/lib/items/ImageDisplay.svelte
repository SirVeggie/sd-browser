<script lang="ts">
    import type { ClientImage } from "$lib/types";
    import Clickable from "./Clickable.svelte";
    import { cx } from "$lib/tools/cx";
    import { SpinLine } from "svelte-loading-spinners";
    import { thumbMode } from "$lib/stores/searchStore";
    import { getQualityParam } from "$lib/tools/imageRequests";
    import { seamlessStyle } from "$lib/stores/styleStore";

    export let img: ClientImage;
    export let onClick: ((e: MouseEvent | KeyboardEvent) => void) | undefined =
        undefined;

    let hasLoaded = false;

    $: src = `${img.url}?${getQualityParam($thumbMode)}`;
    $: active = !!onClick;
    $: seamless = $seamlessStyle;
</script>

<div class:active class:seamless>
    <Clickable up={onClick}>
        {#if !hasLoaded}
            <div class="loading">
                <SpinLine color="#444" />
            </div>
        {/if}
        <img
            class={cx(!hasLoaded && "hidden")}
            {src}
            alt={img.id}
            on:load={() => (hasLoaded = true)}
        />
    </Clickable>
</div>

<style lang="scss">
    div {
        font-family: "Open sans", sans-serif;
        position: relative;
        display: block;
        background-color: #333;
        color: #ddd;
        border-radius: 0.5em;
        box-shadow: 0px 3px 5px #0005;
        overflow: hidden;
        box-sizing: border-box;
        transition: transform 0.4s ease, outline 0.4s ease;
        outline: 1px solid transparent;

        img {
            width: 100%;
            display: block;
            transition: transform 0.4s ease, opacity 0.4s ease;

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

            & img {
                transform: scale(1.1) translateY(-0.5em);
            }
        }

        &.active img {
            cursor: pointer;

            &:hover {
                transform: scale(1.1) translateY(-0.5em);
            }
        }
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
