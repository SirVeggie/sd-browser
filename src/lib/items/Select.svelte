<script lang="ts" context="module">
    export type SelectOption =
        | string
        | { value: string; label: string; title?: string };
</script>

<script lang="ts">
    import { createEventDispatcher, onMount, tick } from "svelte";
    import { alignDropdownPanel } from "$lib/tools/dropdownAlign";
    import { bindDropdownOutsideClick } from "$lib/tools/dropdownOutsideClick";

    export let value = "";
    export let options: readonly SelectOption[] = [];
    export let prefix: string | undefined = undefined;
    export let id: string | undefined = undefined;
    export let disabled = false;
    export let title: string | undefined = undefined;
    export let dropUp = false;
    export let chrome = false;

    const dispatch = createEventDispatcher<{ change: string }>();

    let open = false;
    let rootEl: HTMLDivElement;
    let valueEl: HTMLSpanElement;
    let panelLeft = 0;
    let panelTop = 0;
    let panelBottom = 0;
    let panelMinWidth = 0;
    let panelMaxHeight = 0;
    let removePositionListeners: (() => void) | undefined;

    function normalize(option: SelectOption): {
        value: string;
        label: string;
        title?: string;
    } {
        if (typeof option === "string") {
            return { value: option, label: option };
        }
        return option;
    }

    $: normalized = options.map(normalize);
    $: selectedLabel =
        normalized.find((option) => option.value === value)?.label ?? value;

    $: if (open) {
        tick().then(() => {
            updatePanelPosition();
            startPositionListeners();
        });
    } else {
        stopPositionListeners();
    }

    function updatePanelPosition() {
        if (!rootEl || !valueEl) return;
        const rootRect = rootEl.getBoundingClientRect();
        const fontSize = parseFloat(getComputedStyle(rootEl).fontSize);
        const gap = fontSize * 0.35;
        panelLeft = rootRect.left + alignDropdownPanel(rootEl, valueEl);
        if (dropUp) {
            panelTop = 0;
            panelBottom = window.innerHeight - rootRect.top + gap;
        } else {
            panelTop = rootRect.bottom + gap;
            panelBottom = 0;
        }
        panelMinWidth = Math.max(
            valueEl.getBoundingClientRect().width + fontSize * 2.2,
            fontSize * 6,
        );
        panelMaxHeight = dropUp
            ? Math.max(120, rootRect.top - 8)
            : Math.max(120, window.innerHeight - panelTop - 8);
    }

    function startPositionListeners() {
        stopPositionListeners();
        window.addEventListener("resize", updatePanelPosition);
        window.addEventListener("scroll", updatePanelPosition, true);
        removePositionListeners = () => {
            window.removeEventListener("resize", updatePanelPosition);
            window.removeEventListener("scroll", updatePanelPosition, true);
        };
    }

    function stopPositionListeners() {
        removePositionListeners?.();
        removePositionListeners = undefined;
    }

    function choose(next: string) {
        if (disabled || next === value) {
            open = false;
            return;
        }
        value = next;
        open = false;
        dispatch("change", next);
    }

    function toggleOpen() {
        if (disabled) return;
        open = !open;
    }

    onMount(() => {
        const removeOutsideClick = bindDropdownOutsideClick(
            () => open,
            () => { open = false; },
            () => rootEl,
        );
        return () => {
            removeOutsideClick();
            stopPositionListeners();
        };
    });

    function handleKeydown(event: KeyboardEvent) {
        if (disabled) return;
        if (event.key === "Escape") {
            open = false;
            return;
        }
        if (!open) {
            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open = true;
            }
            return;
        }
        const index = normalized.findIndex((option) => option.value === value);
        if (event.key === "ArrowDown") {
            event.preventDefault();
            const next = normalized[Math.min(index + 1, normalized.length - 1)];
            if (next) value = next.value;
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            const next = normalized[Math.max(index - 1, 0)];
            if (next) value = next.value;
        } else if (event.key === "Enter") {
            event.preventDefault();
            open = false;
            dispatch("change", value);
        }
    }
</script>

<div class="select" class:chrome bind:this={rootEl}>
    <button
        type="button"
        class="trigger"
        class:disabled
        class:chrome
        {id}
        {disabled}
        {title}
        aria-haspopup="listbox"
        aria-expanded={open}
        on:click|stopPropagation={toggleOpen}
        on:keydown={handleKeydown}
    >
        {#if prefix}
            <span class="prefix">{prefix}{chrome ? "" : ":"}</span>
        {/if}
        <span class="value" bind:this={valueEl}>{selectedLabel}</span>
        <span class="chevron" class:open aria-hidden="true" />
    </button>

    {#if open && !disabled}
        <div
            class="panel"
            class:drop-up={dropUp}
            role="listbox"
            aria-labelledby={id}
            style="left: {panelLeft}px;{dropUp ? ` bottom: ${panelBottom}px;` : ` top: ${panelTop}px;`} min-width: {panelMinWidth}px; max-height: {panelMaxHeight}px;"
        >
            {#each normalized as option, index (option.value)}
                <button
                    type="button"
                    class="option"
                    class:selected={option.value === value}
                    role="option"
                    aria-selected={option.value === value}
                    title={option.title}
                    style="--stagger-i: {index}"
                    on:click={() => choose(option.value)}
                >
                    {option.label}
                </button>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    @use "./dropdownAnimations.scss" as dropdown;

    .select {
        position: relative;
        display: inline-flex;
    }

    .select.chrome {
        font-size: 0.7rem;

        @media (width < 701px) {
            font-size: 0.82rem;
        }
    }

    .trigger {
        display: inline-flex;
        align-items: center;
        gap: 0.35em;
        margin: 0;
        padding: 0;
        border: none;
        background: none;
        font-size: 1em;
        color: var(--ink);
        cursor: pointer;
        user-select: none;

        &.chrome {
            gap: 0.25rem;
            padding: 0.28rem 0.45rem;
            box-sizing: border-box;
            border-radius: 7px;
            border: 1px solid var(--line);
            background: rgba(0, 0, 0, 0.22);
            white-space: nowrap;

            .prefix {
                color: var(--muted);
                font-style: normal;
            }

            .value {
                font-weight: 600;
                color: var(--ink);
            }
        }

        &:focus {
            outline: none;
        }

        &:focus-visible {
            border-radius: 0.2em;
            background: rgba(255, 255, 255, 0.06);
        }

        &.chrome:focus-visible {
            background: rgba(0, 0, 0, 0.32);
        }

        &.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }

    .prefix {
        flex-shrink: 0;
    }

    .value {
        flex-shrink: 1;
        min-width: 0;
    }

    .chevron {
        flex-shrink: 0;
        width: 0.35em;
        height: 0.35em;
        border-right: 2px solid var(--muted);
        border-bottom: 2px solid var(--muted);
        transform: rotate(45deg);
        transition: transform 0.2s ease;
        margin-top: -0.15em;
        margin-left: 0.5em;

        &.open {
            transform: rotate(-135deg);
            margin-top: 0.1em;
        }
    }

    .panel {
        position: fixed;
        z-index: 220;
        display: flex;
        flex-direction: column;
        gap: 0.15em;
        overflow-y: auto;
        background: var(--bg-elev);
        border: none;
        border-radius: 0.35em;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        @include dropdown.panel-animation;
        @include dropdown.reduced-motion;

        &.drop-up {
            flex-direction: column-reverse;
            @include dropdown.panel-animation-up;

            .option {
                @include dropdown.option-animation-up;
            }
        }
    }

    .option {
        position: relative;
        display: block;
        width: 100%;
        margin: 0;
        padding: 0.5em 0.7em;
        border: none;
        background: none;
        font-size: inherit;
        color: var(--ink);
        cursor: pointer;
        white-space: nowrap;
        text-align: left;
        border-radius: 0.2em;
        @include dropdown.option-animation;
        @include dropdown.reduced-motion;

        @media (width < 701px) {
            padding: 0.7em 0.85em;
            font-size: 1rem;
        }

        &:hover {
            background: rgba(255, 255, 255, 0.06);
        }

        &:focus {
            outline: none;
        }

        &:focus-visible {
            background: rgba(255, 255, 255, 0.08);
        }

        &.selected::before {
            content: "";
            position: absolute;
            left: 0;
            top: 0.35em;
            bottom: 0.35em;
            width: 0.22em;
            background: var(--accent);
            border-radius: 0 0.18em 0.18em 0;
        }

        &.selected:hover {
            background: rgba(255, 255, 255, 0.06);
        }
    }
</style>
