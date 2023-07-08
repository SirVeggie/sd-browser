<script lang="ts">
    export let onLeft: () => void;
    export let onRight: () => void;
    export let left = true;
    export let right = true;
    export let enabled = true;
</script>

<div></div>
{#if left && enabled}
    <button class="left" on:click={onLeft}>{"<"}</button>
{/if}
{#if right && enabled}
    <button class="right" on:click={onRight}>{">"}</button>
{/if}

<style lang="scss">
    button {
        text-decoration: none;
        appearance: none;
        height: max(10vw, 10vh);
        width: max(5vw, 5vh);
        background-color: #000a;
        border: none;
        color: #fffa;
    }
    
    .left {
        position: fixed;
        top: 50%;
        left: 0;
        transform: translateY(-50%);
        z-index: 10;
        border-radius: 0 0.5em 0.5em 0;
    }
    
    .right {
        position: fixed;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        z-index: 10;
        border-radius: 0.5em 0 0 0.5em;
    }
</style>