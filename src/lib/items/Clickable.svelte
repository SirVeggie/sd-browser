<script lang="ts">
    import { cx } from "$lib/tools/cx";

    export let down: ((e: MouseEvent | KeyboardEvent) => void) | undefined =
        undefined;
    export let up: ((e: MouseEvent | KeyboardEvent) => void) | undefined =
        undefined;
    export let enter: ((e: FocusEvent) => void) | undefined = undefined;
    export let leave: ((e: FocusEvent) => void) | undefined = undefined;
    export let anyClick = false;

    let isDown = false;
    let _class = cx($$restProps.class, "clickable", isDown && "isDown");

    function handleDown(e: MouseEvent | KeyboardEvent) {
        if (e instanceof KeyboardEvent && e.key !== " ") return;
        if (!anyClick && e instanceof MouseEvent && e.button !== 0) return;
        e.preventDefault();
        isDown = true;
        down?.(e);
    }

    function handleUp(e: MouseEvent | KeyboardEvent) {
        if (e instanceof KeyboardEvent && e.key !== " ") return;
        if (!anyClick && e instanceof MouseEvent && e.button !== 0) return;
        e.preventDefault();
        isDown = false;
        up?.(e);
    }

    function handleFocusIn(e: FocusEvent) {
        enter?.(e);
    }

    function handleFocusOut(e: FocusEvent) {
        isDown = false;
        leave?.(e);
    }
</script>

<div
    role="button"
    tabindex="0"
    class={cx(_class, isDown && "isDown")}
    on:click
    on:mousedown={handleDown}
    on:mouseup={handleUp}
    on:keydown={handleDown}
    on:keyup={handleUp}
    on:focusout={handleFocusIn}
    on:focusout={handleFocusOut}
>
    <slot />
</div>

<style lang="scss">
    div {
        width: 100%;
        height: 100%;
    }
</style>
