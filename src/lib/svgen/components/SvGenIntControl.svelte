<script lang="ts">
    import { createEventDispatcher, onMount, tick } from 'svelte';
    import { bindDropdownOutsideClick } from '$lib/tools/dropdownOutsideClick';
    import {
        INT_CONTROL_MODE_LABELS,
        INT_CONTROL_MODES,
    } from '$lib/svgen/intControl';
    import type { IntControlMode } from '$lib/svgen/types';

    export let mode: IntControlMode = 'randomize';

    const dispatch = createEventDispatcher<{ change: IntControlMode }>();

    let open = false;
    let rootEl: HTMLDivElement;
    let triggerEl: HTMLButtonElement;
    let menuStyle = '';
    let unbindOutside: (() => void) | undefined;

    $: modeLabel = INT_CONTROL_MODE_LABELS[mode];

    function iconPath(m: IntControlMode): string {
        switch (m) {
            case 'increment':
                return 'M7 3h2v5h5v2H9v5H7V10H2V8h5V3Z';
            case 'decrement':
                return 'M3 7h10v2H3V7Z';
            case 'randomize':
                return 'M3 3h2v2H3V3Zm4 0h2v2H7V3Zm4 0h2v2h-2V3ZM3 7h2v2H3V7Zm8 0h2v2h-2V7ZM3 11h2v2H3v-2Zm4 0h2v2H7v-2Zm4 0h2v2h-2v-2Z';
            case 'fixed':
                return 'M5 7V5a3 3 0 1 1 6 0v2h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1Zm2-2a1 1 0 1 0 2 0V5a1 1 0 1 0-2 0v2Z';
            default: {
                const _exhaustive: never = m;
                return _exhaustive;
            }
        }
    }

    function close() {
        if (!open)
            return;
        open = false;
        menuStyle = '';
        window.removeEventListener('resize', reposition);
        document.removeEventListener('scroll', reposition, true);
    }

    function reposition() {
        if (!open || !triggerEl)
            return;
        const gap = 8;
        const preferredMaxWidth = 168;
        const preferredMaxHeight = 220;
        const rect = triggerEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap);
        const spaceAbove = Math.max(0, rect.top - gap);
        const dropUp = spaceAbove > spaceBelow;
        const availableHeight = dropUp ? spaceAbove : spaceBelow;
        const height = Math.max(96, Math.min(preferredMaxHeight, availableHeight || preferredMaxHeight));
        const maxPossibleWidth = Math.max(96, viewportWidth - gap * 2);
        const width = Math.min(maxPossibleWidth, preferredMaxWidth);
        let left = rect.right - width;
        if (left + width > viewportWidth - gap)
            left = viewportWidth - gap - width;
        if (left < gap)
            left = gap;
        const top = dropUp ? undefined : rect.bottom + gap;
        const bottom = dropUp ? viewportHeight - rect.top + gap : undefined;
        menuStyle = [
            'position:fixed',
            'z-index:10060',
            `left:${Math.round(left)}px`,
            top != null ? `top:${Math.round(top)}px` : 'top:auto',
            bottom != null ? `bottom:${Math.round(bottom)}px` : 'bottom:auto',
            `width:${Math.round(width)}px`,
            `max-height:${Math.round(height)}px`,
        ].join(';');
    }

    async function toggle() {
        if (open) {
            close();
            return;
        }
        open = true;
        await tick();
        reposition();
        window.addEventListener('resize', reposition);
        document.addEventListener('scroll', reposition, true);
    }

    function pick(next: IntControlMode) {
        dispatch('change', next);
        close();
    }

    onMount(() => {
        unbindOutside = bindDropdownOutsideClick(
            () => open,
            close,
            () => rootEl,
        );
        return () => {
            unbindOutside?.();
            window.removeEventListener('resize', reposition);
            document.removeEventListener('scroll', reposition, true);
        };
    });
</script>

<div class="int-control" class:open bind:this={rootEl}>
    <button
        type="button"
        class="trigger"
        bind:this={triggerEl}
        title="Control after generate: {modeLabel}"
        aria-label="Control after generate: {modeLabel}"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-mode={mode}
        on:pointerdown|stopPropagation
        on:click|stopPropagation={toggle}
    >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path fill="currentColor" d={iconPath(mode)} />
        </svg>
    </button>

    {#if open}
        <div class="menu" style={menuStyle} role="listbox" aria-label="Control after generate">
            {#each INT_CONTROL_MODES as option (option)}
                <button
                    type="button"
                    class="option"
                    class:selected={option === mode}
                    role="option"
                    aria-selected={option === mode}
                    data-mode={option}
                    on:click|stopPropagation={() => pick(option)}
                >
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path fill="currentColor" d={iconPath(option)} />
                    </svg>
                    <span>{INT_CONTROL_MODE_LABELS[option]}</span>
                </button>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    .int-control {
        position: relative;
        flex: 0 0 26px;
        width: 26px;
        display: flex;
        align-items: stretch;
        align-self: stretch;

        &.open {
            z-index: 31;
        }
    }

    .trigger {
        appearance: none;
        display: grid;
        place-items: center;
        width: 26px;
        min-width: 26px;
        height: auto;
        min-height: 24px;
        margin: 0;
        padding: 0;
        border: none;
        border-left: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
        border-radius: 0;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        flex-shrink: 0;

        &:hover,
        .open & {
            color: var(--ink);
            background: var(--accent-soft);
        }

        svg {
            display: block;
            width: 12px;
            height: 12px;
        }
    }

    .menu {
        box-sizing: border-box;
        overflow-x: hidden;
        overflow-y: auto;
        padding: 4px;
        border: none;
        border-radius: 0.35em;
        background: var(--bg-elev);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .option {
        appearance: none;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        justify-content: flex-start;
        padding: 6px 8px;
        border: none;
        border-radius: 0.2em;
        background: transparent;
        color: var(--ink);
        font: inherit;
        font-size: 0.78rem;
        font-weight: 600;
        text-align: left;
        cursor: pointer;

        svg {
            display: block;
            width: 12px;
            height: 12px;
            flex: 0 0 auto;
            color: var(--muted);
        }

        &:hover {
            background: rgba(255, 255, 255, 0.06);
        }

        &.selected {
            background: rgba(255, 255, 255, 0.06);
        }

        &.selected svg {
            color: var(--accent);
        }
    }
</style>
