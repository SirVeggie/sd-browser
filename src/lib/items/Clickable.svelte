<script lang="ts">
    import { cx } from "$lib/tools/cx";

    export let down: (() => void) | undefined = undefined;
    export let up: (() => void) | undefined = undefined;
    export let enter: (() => void) | undefined = undefined;
    export let leave: (() => void) | undefined = undefined;
    
    let isDown = false;
    let _class = cx($$restProps.class, "clickable", isDown && "isDown");
    
    function handleDown(e: MouseEvent | KeyboardEvent) {
        if (e instanceof KeyboardEvent && e.key !== " ") return;
        e.preventDefault();
        isDown = true;
        down?.();
    }
    
    function handleUp(e: MouseEvent | KeyboardEvent) {
        if (e instanceof KeyboardEvent && e.key !== " ") return;
        e.preventDefault();
        isDown = false;
        up?.();
    }
    
    function handleFocusIn() {
        enter?.();
    }
    
    function handleFocusOut() {
        isDown = false;
        leave?.();
    }
</script>

<div role="button" tabindex=0
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
