<script lang="ts">
    import "../../scroll.css";
    import type { ImageInfo } from "$lib/types";
    import { fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";
    import Button from "./Button.svelte";
    import { notify } from "$lib/components/Notifier.svelte";
    import { getPositivePrompt } from "$lib/tools/metadataInterpreter";

    export let cancel: () => void;
    export let imageId: string | undefined;
    export let data: string | ImageInfo | undefined;
    export let enabled = true;

    $: imageUrl = imageId ? `/api/images/${imageId}` : "";
    $: datastring =
        typeof data === "object"
            ? formatMetadata(data)
            : data ?? "(No metadata found)";

    function formatMetadata(d: ImageInfo): string {
        const model = d.prompt?.match(/Model: (.*?),|$/)?.[1] ?? "Unknown";
        const sampler = d.prompt?.match(/Sampler: (.*?),|$/)?.[1] ?? "Unknown";
        let info = `\nModel: ${model}`;
        info += `\nSampler: ${sampler}`;
        info += `\nCreated: ${new Date(d.createdDate).toLocaleDateString()}`;
        info += `\nModified: ${new Date(d.modifiedDate).toLocaleDateString()}`;
        info += `\n\n${d.prompt ?? "No prompt found"}`;
        return info;
    }

    function handleEsc(e: KeyboardEvent) {
        if (e.key === "Escape") cancel();
    }

    function prevent(e: Event) {
        e.stopPropagation();
        e.preventDefault();
    }

    function copyPrompt() {
        if (!imageId) return;
        if (!(typeof data === "object") || !data.prompt)
            return notify("No prompt to copy");
        navigator.clipboard.writeText(data.prompt).then(() => {
            notify("Copied prompt to clipboard");
        });
    }

    function copyPositive() {
        if (!imageId) return;
        if (!(typeof data === "object") || !data.prompt)
            return notify("No positive to copy");
        const positive = getPositivePrompt(data.prompt);
        navigator.clipboard.writeText(positive).then(() => {
            notify("Copied positive prompt");
        });
    }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
{#if enabled && imageId}
    <div
        class="image_overlay"
        on:click={cancel}
        on:keydown={handleEsc}
        transition:fade={{ duration: 300, easing: cubicOut }}
    >
        <div class="layout">
            <div>
                <div class="card">
                    <img src={imageUrl} alt={imageId} />
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                    {#if data}
                        <div class="info" on:click={prevent}>
                            <p>{datastring}</p>
                            <div class="buttons">
                                <Button on:click={copyPrompt}>Copy</Button>
                                <Button on:click={copyPositive}>+</Button>
                            </div>
                        </div>
                    {/if}
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
            max-height: calc(100dvh - var(--pad) * 2);
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
                margin-bottom: 0.5em;

                :global(button) {
                    margin-bottom: 0.5em;
                }
            }
        }
    }
</style>
