<script lang="ts">
    export let text = "";

    let open = false;
    let triggerEl: HTMLDivElement | undefined;
    let top = 0;
    let left = 0;

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    function place() {
        if (!triggerEl)
            return;
        const rect = triggerEl.getBoundingClientRect();
        top = rect.bottom + 8;
        left = Math.min(rect.right, window.innerWidth - 16);
    }

    function show() {
        place();
        open = true;
    }

    function hide() {
        open = false;
    }
</script>

<div
    bind:this={triggerEl}
    class="trigger"
    tabindex="0"
    on:mouseenter={show}
    on:mouseleave={hide}
    on:focusin={show}
    on:focusout={hide}
>
    <slot />
</div>

{#if open && text}
    <div
        use:portal
        class="tip"
        role="tooltip"
        style={`top:${top}px;left:${left}px`}
    >
        {text}
    </div>
{/if}

<style lang="scss">
    .trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        width: 100%;
        min-width: 0;

        &:focus {
            outline: none;
        }

        &:focus-visible {
            outline: 1px solid rgba(196, 165, 116, 0.45);
            outline-offset: 3px;
            border-radius: 6px;
        }
    }

    .tip {
        position: fixed;
        z-index: 10060;
        transform: translateX(-100%);
        width: min(22rem, calc(100vw - 1.5rem));
        padding: 0.65rem 0.75rem;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: color-mix(in srgb, var(--bg) 88%, #000);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
        color: var(--muted);
        font-size: 0.78rem;
        line-height: 1.45;
        pointer-events: none;
    }
</style>
