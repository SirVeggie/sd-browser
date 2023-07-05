<script>
    import Webui from "$lib/components/Webui.svelte";

    // import { onMount } from "svelte";
    import Notifier from "../lib/components/Notifier.svelte";
    // import { page } from "$app/stores";
    
    // onMount(() => {
        // $page.url.origin;
    // });
</script>

<main>
    <slot />
    <Webui />
    <Notifier />
</main>

<style>
    main {
        position: absolute;
        top: 0; left: 0; right: 0;
        min-height: 100dvh;
        background-color: #242424;
        padding: 2em;
        box-sizing: border-box;
        color: #ddd;
    }
</style>