<script lang="ts">
    import { autofocus } from "../../actions/autofocus";

    export let down: (() => void) | undefined = undefined;
    export let up: (() => void) | undefined = undefined;
    export let focus = false;

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
    use:autofocus={focus}
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
        font-size: 0.8rem;
        line-height: 1.2;
        display: inline-block;
        appearance: none;
        box-sizing: border-box;
        padding: 0.5em 1em;
        border: none;
        border-radius: 0.4em;
        background-color: var(--accent-soft);
        color: var(--ink);
        cursor: pointer;
        transition: background-color 0.08s ease, transform 0.08s ease;

        &:hover,
        &:focus-visible {
            background-color: rgba(196, 165, 116, 0.24);
            transform: translateY(-1px);
        }

        &:active {
            background-color: rgba(196, 165, 116, 0.12);
            transform: translateY(0px);
        }

        &:focus {
            outline: none;
        }
    }
</style>
