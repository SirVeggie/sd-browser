<script>
    import { fade } from "svelte/transition";
    import { outclick } from "../../actions/outclick";
    import { cubicOut } from "svelte/easing";

    export let open = false;
    export let close = () => {};
</script>

{#if open}
    <div class="modal" transition:fade={{ duration: 300, easing: cubicOut }}>
        <div class="box" use:outclick on:outclick={close}>
            <slot />
        </div>
    </div>
{/if}

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
    }

    .box {
        background-color: #222d;
        padding: 1em 2em;
        border-radius: 0.5em;
        box-shadow: 0px 5px 5px #0005;
        min-width: 200px;
        min-height: 150px;
    }
</style>
