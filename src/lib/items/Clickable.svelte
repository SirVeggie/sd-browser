<script lang="ts">
    import { cx } from "$lib/tools/cx";
    import type { inputEvent, pcEvent } from "$lib/types/misc";

    export let down: ((e: pcEvent) => void) | undefined = undefined;
    export let up: ((e: pcEvent) => void) | undefined = undefined;
    export let contextMenu: ((e: inputEvent) => void) | undefined = undefined;
    export let enter: ((e: FocusEvent) => void) | undefined = undefined;
    export let leave: ((e: FocusEvent) => void) | undefined = undefined;
    export let anyClick = false;
    
    let isDown = false;
    let preventTouchUp = false;
    let _class = cx($$restProps.class, "clickable", isDown && "isDown");
    let contextTimeout: any = undefined;
    let contextDelay = 600;

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
        if (isDown) {
            isDown = false;
            up?.(e);
        }
    }

    function handleFocusIn(e: FocusEvent) {
        enter?.(e);
    }

    function handleFocusOut(e: FocusEvent) {
        isDown = false;
        leave?.(e);
    }

    function handleTouchStart(e: TouchEvent) {
        preventTouchUp = false;
        if (contextMenu) {
            contextTimeout = setTimeout(() => {
                isDown = false;
                preventTouchUp = true;
                contextMenu?.(e);
            }, contextDelay);
        }
    }

    function handleTouchEnd(e: TouchEvent) {
        clearTimeout(contextTimeout);
        if (preventTouchUp) {
            e.preventDefault();
        }
    }

    function handTouchMove(e: TouchEvent) {
        clearTimeout(contextTimeout);
    }

    function handleTouchCancel(e: TouchEvent) {
        clearTimeout(contextTimeout);
    }

    function handleContextMenu(e: MouseEvent | KeyboardEvent | TouchEvent) {
        if (contextMenu) {
            e.preventDefault();
            e.stopPropagation();
            clearTimeout(contextTimeout);

            if (e instanceof TouchEvent) return;
            isDown = false;
            contextMenu(e);
        }
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
    on:touchstart={handleTouchStart}
    on:touchend={handleTouchEnd}
    on:touchmove={handTouchMove}
    on:touchcancel={handleTouchCancel}
    on:contextmenu={handleContextMenu}
>
    <slot />
</div>

<style lang="scss">
    div {
        width: 100%;
        height: 100%;
        -webkit-touch-callout: none;
    }
</style>
