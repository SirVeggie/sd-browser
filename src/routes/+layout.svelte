<script lang="ts">
    import '../global.css';
    import Webui from "$lib/components/Webui.svelte";
    import { flyoutStore } from "$lib/stores/flyoutStore";
    import Notifier from "../lib/components/Notifier.svelte";
</script>

<main>
    <slot />
    {#if $flyoutStore.enabled}
        <Webui />
    {/if}
    <Notifier />
</main>

<style>
    main {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        min-height: 100dvh;
        background-color: #242424;
        --main-padding: 2em;
        /* padding: var(--main-padding); */
        box-sizing: border-box;
        color: #ddd;
    }
</style>
