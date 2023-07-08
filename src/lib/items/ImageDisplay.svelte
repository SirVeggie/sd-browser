<script lang="ts">
    import type { ClientImage } from "$lib/types";
    import Clickable from "./Clickable.svelte";
    import { cx } from "$lib/tools/cx";
    import { SpinLine } from "svelte-loading-spinners";

    export let img: ClientImage;
    export let onClick: ((e: MouseEvent | KeyboardEvent) => void) | undefined =
        undefined;

    let hasLoaded = false;
</script>

<div class={cx(onClick && "active")}>
    <Clickable up={onClick}>
        {#if !hasLoaded}
            <div class="loading">
                <SpinLine color="#444" />
            </div>
        {/if}
        <img
            class={cx(!hasLoaded && "hidden")}
            src={img.url}
            alt={img.id}
            on:load={() => (hasLoaded = true)}
        />
    </Clickable>
</div>

<style lang="scss">
    div {
        font-family: "Open sans", sans-serif;
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
            }
        }

        &.active:hover,
        &.active:has(:focus-visible) {
            transform: translateY(-0.5em);
            outline: 1px solid #fffa;

            & img {
                transform: scale(1.1);
            }
        }

        &.active img {
            cursor: pointer;

            &:hover {
                transform: scale(1.1);
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

        // & > div {
        //     width: 100%;
        //     height: 100%;
        //     display: flex;
        //     justify-content: center;
        //     align-items: center;
        // }
    }
</style>
