<script lang="ts">
    import "../../scroll.css";
    import type { ImageContainer } from "$lib/types";
    import { fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";
    import Button from "./Button.svelte";
    import { notify } from "$lib/components/Notifier.svelte";

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
    
    function copyPrompt() {
        if (!img.metadata.parameters) return notify("No prompt to copy");
        navigator.clipboard.writeText(img.metadata.parameters).then(() => {
            notify("Copied to clipboard");
        });
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
        <div class="layout">
            <div>
                <div class="card">
                    <img src={img.file} alt={img.id} />
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                    <div class="info" on:click={prevent}>
                        <p>
                            {#each Object.keys(img.metadata) as key}
                                {key}: {img.metadata[key]}
                                <br />
                            {/each}
                        </p>
                        <div class="buttons">
                            <Button on:click={copyPrompt}>Copy</Button>
                        </div>
                    </div>
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
        --pad: min(5vh, 5vw);
        padding: var(--pad);
        backdrop-filter: blur(10px);

        .layout {
            display: flex;
            justify-content: center;
            height: 100%;
            position: relative;
            
            & > div {
                max-height: 100%;
                max-width: 100%;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }

            .card {
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
            max-height: calc(100dvh - var(--pad)*2);
            max-width: 100%;
        }

        .info {
            display: flex;
            font-size: 0.5em;
            margin: 0;
            // width: 100%;
            width: 0;
            min-width: calc(100% - 2em);

            p {
                // margin: 1em;
                // padding: 0;
                white-space: pre-wrap;
                flex-grow: 1;
            }
            
            .buttons {
                display: flex;
                flex-direction: column;
                // width: 100%;
                margin-top: 1em;
            }
        }
    }
</style>
