<script lang="ts">
    import type { ImageSearchRef } from "$lib/stores/imageRefStore";
    import { fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";

    export let ref: ImageSearchRef;
    export let imageUrl: string;
    export let onClose: () => void;
    export let onRemove: () => void;

    function handleRemove(e: MouseEvent) {
        e.stopPropagation();
        onRemove();
        onClose();
    }

    function handleImageClick() {
        onClose();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            onClose();
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
    class="overlay"
    transition:fade={{ duration: 180, easing: cubicOut }}
    on:click|self={onClose}
>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="frame" on:click={handleImageClick} role="img" aria-label={`Reference #${ref.slot}`}>
        <img src={imageUrl} alt={`Reference #${ref.slot}`} draggable="false" />
        <div class="bar">
            <span class="label">Reference #{ref.slot}</span>
            <button type="button" class="remove-btn" on:click={handleRemove}>
                Remove
            </button>
        </div>
    </div>
</div>

<style lang="scss">
    .overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: min(4vh, 1.5rem);
        background: #000a;
        backdrop-filter: blur(10px);
        box-sizing: border-box;
    }

    .frame {
        position: relative;
        max-width: min(480px, 95vw);
        max-height: min(480px, 85vh);
        border-radius: 0.45em;
        overflow: hidden;
        box-shadow: 0 12px 40px #000a;
        cursor: default;
        background: #111;
        line-height: 0;

        img {
            display: block;
            max-width: min(480px, 95vw);
            max-height: min(480px, 85vh);
            width: auto;
            height: auto;
            object-fit: contain;
            pointer-events: none;
        }
    }

    .bar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75em;
        padding: 0.65em 0.85em;
        background: linear-gradient(180deg, transparent 0%, #000c 55%, #000e 100%);
        pointer-events: none;
        line-height: normal;
    }

    .label {
        color: #eee;
        font-size: 0.9rem;
        font-weight: 500;
        text-shadow: 0 1px 3px #000c;
        pointer-events: none;
    }

    .remove-btn {
        pointer-events: auto;
        flex-shrink: 0;
        appearance: none;
        border: 1px solid #ffffff2a;
        border-radius: 0.35em;
        padding: 0.4em 0.75em;
        background: #ffffff14;
        color: #ddd;
        font-size: 0.8rem;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;

        &:hover {
            background: #ffffff22;
            border-color: #ffffff44;
            color: #fff;
        }
    }
</style>
