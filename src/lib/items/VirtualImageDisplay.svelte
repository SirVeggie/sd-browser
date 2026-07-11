<script lang="ts">
    import type { InputEvent } from "$lib/types/misc";
    import { imageSpacing } from "$lib/stores/styleStore";
    import { observeViewport } from "$lib/tools/viewportObserver";
    import type { ClientImage } from "$lib/types/images";
    import ImageDisplay from "./ImageDisplay.svelte";

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

    let nearViewport = false;

    $: spacingCompact = $imageSpacing === "compact";
    $: spacingMosaic = $imageSpacing === "mosaic";
    $: hasDimensions = !!(img.width && img.height);
    $: containerStyle = hasDimensions
        ? `aspect-ratio: ${img.width} / ${img.height}`
        : undefined;
</script>

<div
    class="shell"
    class:spacing-compact={spacingCompact}
    class:spacing-mosaic={spacingMosaic}
    class:selected
    class:has-dimensions={hasDimensions}
    style={containerStyle}
    use:observeViewport={(visible) => {
        nearViewport = visible;
    }}
>
    {#if nearViewport}
        <ImageDisplay
            {img}
            {onClick}
            {onContext}
            {selected}
            {loadSession}
            {onLoaded}
            {shimmerIndex}
        />
    {:else}
        <div class="placeholder" aria-hidden="true"></div>
    {/if}
</div>

<style lang="scss">
    $accent-blue: rgb(63, 187, 236);
    $accent-glow: rgba(63, 187, 236, 0.45);
    $accent-glow-soft: rgba(63, 187, 236, 0.2);

    .shell {
        display: block;
        position: relative;
        box-sizing: border-box;
        border-radius: 0.5em;
        background-color: transparent;
        outline: 1px solid transparent;
        user-select: none;

        &.selected {
            outline: 2px solid $accent-blue;
            outline-offset: -2px;
            box-shadow:
                inset 0 0 14px 2px $accent-glow,
                inset 0 0 28px 6px $accent-glow-soft;
        }

        &.spacing-mosaic {
            border-radius: 0;
            outline-offset: -1px;
        }
    }

    .placeholder {
        display: block;
        width: 100%;
        min-height: 100%;
        background-color: transparent;
        pointer-events: none;
    }

    .shell:not(.has-dimensions) .placeholder {
        height: 20em;
    }
</style>
