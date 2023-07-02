<script lang="ts">
    export let pos = 0;
</script>

<div style="transform: translateY({pos}px)">
    <slot />
</div>

<style lang="scss">
    div {
        font-family: "Open sans", sans-serif;
        width: 100px;
        height: 100px;
        background-color: #333;
        color: #ddd;
        border-radius: 0.5em;
        padding: 1em;
        margin-top: 1em;
        box-shadow: 0px 3px 5px #0005;
        transition: transform 150ms;
    }
</style>