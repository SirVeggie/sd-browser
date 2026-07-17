<script>
    import { fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";
    import { onMount } from "svelte";

    export let close = () => {};

    let rootEl;

    onMount(() => {
        if (!rootEl) return;
        document.body.appendChild(rootEl);
        return () => {
            rootEl?.remove();
        };
    });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
    bind:this={rootEl}
    class="modal"
    transition:fade={{ duration: 200, easing: cubicOut }}
    on:click|self={close}
>
    <div class="box" on:click|stopPropagation>
        <slot />
    </div>
</div>

<style lang="scss">
    .modal {
        position: fixed;
        background-color: rgba(5, 4, 3, 0.55);
        backdrop-filter: blur(10px);
        display: flex;
        justify-content: center;
        align-items: center;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 210;
        padding: 2em;
        box-sizing: border-box;
    }

    .box {
        background-color: var(--glass);
        backdrop-filter: blur(18px) saturate(1.2);
        border: none;
        padding: 1em 2em;
        border-radius: 0.65em;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
        min-width: min(200px, 100%);
        min-height: min(150px, 100%);
        max-width: 100%;
        max-height: 100%;
        box-sizing: border-box;
        overflow-x: hidden;
        overflow-y: auto;
        color: var(--ink);
    }
</style>
