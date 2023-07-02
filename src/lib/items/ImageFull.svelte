<script lang="ts">
    import "../../scroll.css";
    import type { ImageContainer } from "$lib/types";
    import { fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";

    export let cancel: () => void;
    export let img: ImageContainer;
    export let enabled = true;

    function handleEsc(e: KeyboardEvent) {
        if (e.key === "Escape") cancel();
    }
    
    function prevent(e: Event) {
        e.stopPropagation();
        e.preventDefault();
    }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
{#if enabled}
    <div
        class="image_overlay"
        on:click={cancel}
        on:keydown={handleEsc}
        transition:fade={{ duration: 300, easing: cubicOut }}
    >
        <div>
            <div>
                <img src={img.file} alt={img.id} />
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                <div class="info">
                    <p on:click={prevent}>ID: this is a somewhat long string that makes no sense</p>
                </div>
            </div>
        </div>
    </div>
{/if}

<style lang="scss">
    .image_overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #000a;
        padding: 5vw;
        backdrop-filter: blur(10px);

        & > div {
            display: flex;
            justify-content: center;
            max-height: 100%;
            position: relative;
            
            & > div {
                background-color: #111b;
                border-radius: 0.5em;
                overflow-x: hidden;
                overscroll-behavior-y: contain;
                display: flex;
                flex-direction: column;
                align-items: center;
                color: #ddd;
                font-family: "Open sans", sans-serif;
                font-size: 2em;
            }
        }
        
        img {
            max-height: calc(100dvh - 10vw);
        }
        
        .info {
            margin-top: 1em;
            font-size: 0.5em;
            margin: 0;
            width: 100%;
            
            p {
                margin: 1em;
                padding: 0;
                width: 0;
                min-width: calc(100% - 2em);
            }
            
        }
    }
</style>
