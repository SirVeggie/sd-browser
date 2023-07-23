<script lang="ts">
    import { cx } from "$lib/tools/cx";
    import { flyoutState, flyoutStore } from "$lib/stores/flyoutStore";

    let iframe: HTMLIFrameElement;

    export function fullscreen() {
        iframe.requestFullscreen();
    }

    function toggle() {
        flyoutState.set(!$flyoutState);
    }
</script>

<div class={cx(!$flyoutState && "disabled")}>
    <iframe
        title="sd"
        bind:this={iframe}
        src={$flyoutStore.url}
        frameborder="0"
        allow="fullscreen"
    />
</div>
<button on:click={toggle}>{$flyoutState ? 'Close' : 'Open'}</button>

<style lang="scss">
    div {
        position: fixed;
        top: 0;
        left: calc(100dvw - var(--flyout-width));
        right: 0;
        bottom: 0;
        z-index: 50;

        transition: opacity 0.2s ease, transform 0.2s ease;

        &.disabled {
            opacity: 0;
            pointer-events: none;
            transform: translateX(100%);
        }
        
        @media (width < 650px) {
            left: 0;
        }
    }
    
    iframe {
        display: block;
        width: 100%;
        height: 100%;
    }

    button {
        z-index: 99;
        font-size: 1.5em;
        appearance: none;
        border: 1px solid #fff1;
        background-color: #222a;
        border-radius: 0.5em;
        position: fixed;
        bottom: 1em;
        right: 1em;
        width: 5em;
        height: 2.5em;
        cursor: pointer;
    }
</style>
