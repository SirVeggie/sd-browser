<script lang="ts">
    export let password = false;
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
    <form>
        {#if password}
            <input
                type="password"
                autocomplete="new-password"
                id="pwd"
                bind:this={element}
                {placeholder}
                on:change
                on:input
                on:focus
                on:blur
                bind:value
            />
        {:else}
            <input
                type="text"
                bind:this={element}
                {placeholder}
                on:change
                on:input
                on:focus
                on:blur
                bind:value
            />
        {/if}
    </form>
    <button on:click={clear}>x</button>
</div>

<style lang="scss">
    div {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
        box-sizing: border-box;
    }

    input {
        width: 100%;
        background-color: rgba(0, 0, 0, 0.22);
        color: var(--ink);
        border-radius: 9px;
        border: none;
        padding: 0.5em 0.5em;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        box-sizing: border-box;

        &:focus {
            outline: none;
            box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.55);
        }
    }

    form {
        width: 100%;
    }

    button {
        appearance: none;
        background-color: transparent;
        border: none;
        position: absolute;
        right: 0.5em;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        padding: 0;
        height: 1.25em;
        width: 1.25em;
        cursor: pointer;
        color: var(--muted);
    }
</style>
