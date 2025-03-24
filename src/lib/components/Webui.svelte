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
        left: calc(100dvw - var(--flyout-width));
        right: 0;
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
        color: #ddda;
        appearance: none;
        border: 1px solid #fff3;
        background-color: #222a;
        border-radius: 5px 0px 0px 5px;
        border-right: none;
        padding: 15px;
        position: fixed;
        right: var(--flyout-width);
        cursor: pointer;
        top: auto;
        bottom: 50px;
        
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
