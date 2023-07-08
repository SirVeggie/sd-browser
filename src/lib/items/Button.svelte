<script lang="ts">
    export let down: (() => void) | undefined = undefined;
    export let up: (() => void) | undefined = undefined;
    
    $: buttonProps = {
        class: $$restProps.class,
    };

    function handleDown(e: MouseEvent | KeyboardEvent) {
        if (e instanceof KeyboardEvent && e.key !== " ") return;
        if (down) down();
    }

    function handleUp(e: MouseEvent | KeyboardEvent) {
        if (e instanceof KeyboardEvent && e.key !== " ") return;
        if (up) up();
    }
</script>

<button
    on:click
    on:focusout
    on:mousedown={handleDown}
    on:mouseup={handleUp}
    on:keydown={handleDown}
    on:keyup={handleUp}
    {...buttonProps}
>
    <slot />
</button>

<style>
    button {
        font-family: "Open sans", sans-serif;
        font-size: 0.8rem;
        line-height: 1.2;
        display: inline-block;
        appearance: none;
        padding: 0.5em 1em;
        border: 1px solid rgb(63, 187, 236);
        border-radius: 0.4em;
        background-color: rgb(62, 138, 168);
        color: rgb(255, 255, 255);
        cursor: pointer;
        transition: border-color 0.2s ease, background-color 0.08s ease,
            transform 0.08s ease;

        &:hover,
        &:focus-visible {
            border-color: white;
            transform: translateY(-2px);
        }

        &:active {
            background-color: rgba(62, 138, 168, 0.5);
            transform: translateY(0px);
        }

        &:focus {
            outline: none;
        }
    }
</style>
