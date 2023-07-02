<script>
    import Notifier from "../lib/components/Notifier.svelte";
</script>

<main>
    <slot />
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
    }
</style>