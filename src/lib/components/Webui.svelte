<script lang="ts">
    import { cx } from "$lib/tools/cx";

    export let enabled = true;

    let iframe: HTMLIFrameElement;

    export function fullscreen() {
        iframe.requestFullscreen();
    }

    function toggle() {
        enabled = !enabled;
    }
</script>

<div class={cx(!enabled && "disabled")}>
    <iframe
        title="sd"
        bind:this={iframe}
        src="http://82.181.83.241:18888"
        frameborder="0"
        allow="fullscreen"
    />
</div>
<button on:click={toggle}>{enabled ? 'Close' : 'Open'}</button>

<style lang="scss">
    iframe {
        display: block;
        width: 100%;
        height: 100%;
    }

    div {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;

        transition: opacity 0.2s ease;

        &.disabled {
            opacity: 0;
            pointer-events: none;
        }
    }

    button {
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
