<script>
    import { fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";

    export let close = () => {};
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
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
        background-color: #222a;
        backdrop-filter: blur(10px);
        display: flex;
        justify-content: center;
        align-items: center;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 100;
        padding: 2em;
        box-sizing: border-box;
    }

    .box {
        background-color: #222d;
        padding: 1em 2em;
        border-radius: 0.5em;
        box-shadow: 0px 5px 5px #0005;
        min-width: min(200px, 100%);
        min-height: min(150px, 100%);
        max-width: 100%;
        max-height: 100%;
        box-sizing: border-box;
        overflow-x: hidden;
        overflow-y: auto;
    }
</style>
