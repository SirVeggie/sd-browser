<script lang="ts">
    export let placeholder = "";
    export let value = "";
    export let element: HTMLInputElement | undefined = undefined;

    async function clear() {
        value = "";
        element?.focus();
        await Promise.resolve();
        element?.dispatchEvent(new Event("input"));
        element?.dispatchEvent(new Event("change"));
    }
</script>

<div class="input">
    <input
        type="text"
        bind:this={element}
        {placeholder}
        on:change
        on:input
        bind:value
    />
    <button on:click={clear}>x</button>
</div>

<style lang="scss">
    div {
        position: relative;
        display: flex;
        align-items: center;
    }

    input {
        font-family: "Open sans", sans-serif;
        width: 100%;
        // height: 2.2em;
        background-color: #333;
        color: #ddd;
        border-radius: 0.5em;
        border: 0px solid transparent;
        padding: 0.5em 0.5em;
        box-shadow: inset 0px 2px 3px #0005;
        border: 1px solid #1118;
        // border: 1px solid #fff;
        box-sizing: border-box;

        &:focus {
            outline: none;
            border: 1px solid #aaad;
        }
    }

    button {
        appearance: none;
        background-color: transparent;
        border: none;
        position: absolute;
        right: 0.5em;
        cursor: pointer;
        color: #ddd3;
    }
</style>
