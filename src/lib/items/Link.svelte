<script lang="ts">
    import { goto } from "$app/navigation";
    import { cx } from "$lib/tools/cx";

    let down = false;
    const to = $$restProps.to;
    let _class = cx($$restProps.class, down && "down");

    function handleSpaceDown(e: KeyboardEvent) {
        if (e.key !== " ") return;
        down = true;
    }

    function handleSpaceUp(e: KeyboardEvent) {
        if (e.key !== " ") return;
        down = false;
        goto(to);
    }

    function handleFocusOut() {
        down = false;
    }
</script>

<a
    href={to}
    class={cx(_class, down && "down")}
    on:keydown={handleSpaceDown}
    on:keyup={handleSpaceUp}
    on:focusout={handleFocusOut}
>
    <slot />
</a>

<style lang="scss">
    a {
        font-family: "Open sans", sans-serif;
        display: inline-block;
        font-size: 0.8rem;
        line-height: 1.2;
        text-decoration: none;
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

        &:active,
        &.down {
            background-color: rgba(62, 138, 168, 0.5);
            transform: translateY(0px);
        }

        &:focus {
            outline: none;
        }
    }
</style>
