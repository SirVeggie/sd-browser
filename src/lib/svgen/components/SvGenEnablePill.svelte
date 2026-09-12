<script lang="ts">
    import { createEventDispatcher, tick } from 'svelte';
    import { pinColumnScroll } from '$lib/svgen/pinColumnScroll';

    export let checked = false;
    export let title = 'Enable';
    /** Smaller toggle for dense card headers. */
    export let compact = false;
    export let id: string | undefined = undefined;

    const dispatch = createEventDispatcher<{ change: boolean }>();

    function isEditable(el: Element | null): el is HTMLElement {
        if (!(el instanceof HTMLElement))
            return false;
        if (el instanceof HTMLTextAreaElement)
            return true;
        if (el instanceof HTMLInputElement) {
            const type = el.type;
            return type !== 'button' && type !== 'submit' && type !== 'checkbox'
                && type !== 'radio' && type !== 'file' && type !== 'reset';
        }
        return el.isContentEditable;
    }

    function onPointerDown(event: PointerEvent) {
        event.stopPropagation();
        pinColumnScroll(event.currentTarget);

        // Touch: blur text controls first — `preventDefault` alone would *keep*
        // focus there and reopen the soft keyboard on every toggle.
        const touch = event.pointerType === 'touch' || event.pointerType === 'pen';
        const active = document.activeElement;
        if (touch && isEditable(active))
            active.blur();

        // Block the pill from taking focus (column focus-scroll). On mouse this
        // also preserves the caret in the active text field.
        event.preventDefault();
    }

    async function onClick(event: MouseEvent) {
        event.stopPropagation();
        const target = event.currentTarget;
        pinColumnScroll(target);
        dispatch('change', !checked);
        // Workflow rediscovery / row re-render can still nudge scroll on mobile.
        await tick();
        pinColumnScroll(target);
    }
</script>

<button
    type="button"
    class="pill"
    class:is-on={checked}
    class:compact
    {id}
    role="switch"
    aria-checked={checked}
    aria-label={checked ? 'Enabled' : 'Disabled'}
    {title}
    on:click={onClick}
    on:pointerdown={onPointerDown}
>
    <span class="thumb" aria-hidden="true" />
</button>

<style lang="scss">
    .pill {
        flex: 0 0 auto;
        position: relative;
        box-sizing: border-box;
        display: block;
        width: 36px;
        height: 20px;
        margin: 0;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: #2a2420;
        box-shadow: none;
        color: transparent;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
        transition: background 0.14s ease, box-shadow 0.14s ease;

        &:hover {
            background: color-mix(in srgb, #2a2420 80%, var(--ink));
        }

        &.is-on {
            background: var(--accent);
            box-shadow: none;

            &:hover {
                background: color-mix(in srgb, var(--accent) 85%, var(--ink));
            }

            .thumb {
                left: 19px;
            }
        }

        &.compact {
            width: 28px;
            height: 15px;

            .thumb {
                width: 11px;
                height: 11px;
                left: 2px;
            }

            &.is-on .thumb {
                left: 15px;
            }
        }

        &:focus-visible {
            outline: none;
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
        }
    }

    .thumb {
        position: absolute;
        top: 50%;
        left: 3px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #f0e6d8;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
        transform: translateY(-50%);
        transition: left 0.14s ease;
        pointer-events: none;
    }
</style>
