<script lang="ts">
    import type { ClientImage } from "$lib/types";
    import Clickable from "./Clickable.svelte";
    import { cx } from "$lib/tools/cx";

    export let img: ClientImage;
    export let onClick: ((e: MouseEvent | KeyboardEvent) => void) | undefined = undefined;
</script>

<div class={cx(onClick && "active")}>
    <Clickable up={onClick}>
        <img src={img.url} alt={img.id} />
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
            transition: transform 0.4s ease;
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
</style>
