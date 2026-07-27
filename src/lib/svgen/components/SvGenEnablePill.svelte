<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let checked = false;
    export let title = 'Enable';
    /** Smaller toggle for dense card headers. */
    export let compact = false;

    const dispatch = createEventDispatcher<{ change: boolean }>();
</script>

<button
    type="button"
    class="pill"
    class:is-on={checked}
    class:compact
    role="switch"
    aria-checked={checked}
    aria-label={checked ? 'Enabled' : 'Disabled'}
    {title}
    on:click|stopPropagation={() => dispatch('change', !checked)}
    on:pointerdown|stopPropagation
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
