<script lang="ts">
    import {
        flyoutButton,
        flyoutButtonTop,
        flyoutState,
        flyoutStore,
    } from "$lib/stores/flyoutStore";

    let iframe: HTMLIFrameElement;
    $: disabled = !$flyoutState || !$flyoutStore.enabled;
    $: isTop = $flyoutButtonTop;

    export function fullscreen() {
        iframe.requestFullscreen();
    }

    function toggle() {
        flyoutState.set(!$flyoutState);
    }
</script>

<div class="no-scrollbar" class:disabled>
    <iframe
        title="sd"
        bind:this={iframe}
        src={$flyoutStore.url}
        frameborder="0"
        allow="fullscreen; clipboard-write"
    />
</div>
{#if $flyoutButton}
    <button on:click={toggle} class:isTop>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            class:flip={$flyoutState}
        >
            <path
                d="M15 4l-8 8 8 8"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    </button>
{/if}

<style lang="scss">
    div {
        position: fixed;
        top: 0;
        right: 0;
        width: var(--flyout-width);
        bottom: 0;
        z-index: 50;
        overflow-y: scroll;
        overscroll-behavior-y: contain;

        transition:
            opacity 0.2s ease,
            transform 0.2s ease;

        &.disabled {
            opacity: 0;
            pointer-events: none;
            transform: translateX(100%);
        }
    }

    iframe {
        display: block;
        width: 100%;
        height: calc(100% + 1px);
    }

    button {
        line-height: 0;
        z-index: 99;
        color: var(--ink);
        appearance: none;
        border: 1px solid var(--line);
        background-color: var(--glass);
        backdrop-filter: blur(12px) saturate(1.2);
        border-radius: 14px 0 0 14px;
        border-right: none;
        padding: 15px;
        position: fixed;
        right: calc(var(--flyout-width) * var(--flyout-button-reset));
        cursor: pointer;
        top: auto;
        bottom: 9.5rem;
        
        &.isTop {
            top: 90px;
            bottom: auto;
        }
        
        :global(.flanimate) & {
            transition: right 0.2s ease;
        }
        
        svg.flip {
            transform: scaleX(-1);
        }
    }
</style>
