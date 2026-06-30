<script lang="ts">
    import { createEventDispatcher, onMount, tick } from "svelte";
    import {
        activeCustomFilterIds,
        customFiltersStore,
        type CustomFilter,
    } from "$lib/stores/customFiltersStore";
    import { alignDropdownPanel } from "$lib/tools/dropdownAlign";

    export let onChange: (() => void) | undefined = undefined;

    const dispatch = createEventDispatcher<{ change: void }>();

    let open = false;
    let rootEl: HTMLDivElement;
    let valueEl: HTMLSpanElement;
    let panelLeft = 0;

    $: filters = $customFiltersStore.filters;
    $: activeIds = new Set($activeCustomFilterIds);
    $: label = formatLabel(filters, activeIds);

    $: if (open) {
        tick().then(updatePanelAlign);
    }

    function formatLabel(items: CustomFilter[], active: Set<string>): string {
        if (active.size === 0) return "none";
        const names = items.filter((f) => active.has(f.id)).map((f) => f.name);
        if (names.length <= 2) return names.join(", ");
        return `${names.length} active`;
    }

    function updatePanelAlign() {
        if (!rootEl || !valueEl) return;
        panelLeft = alignDropdownPanel(rootEl, valueEl, 1);
    }

    function toggle(id: string) {
        activeCustomFilterIds.update((ids) => {
            if (ids.includes(id)) return ids.filter((x) => x !== id);
            return [...ids, id];
        });
        onChange?.();
        dispatch("change");
    }

    function handleDocumentClick(event: MouseEvent) {
        if (!open || !rootEl) return;
        if (!rootEl.contains(event.target as Node)) open = false;
    }

    onMount(() => {
        document.addEventListener("click", handleDocumentClick);
        return () => document.removeEventListener("click", handleDocumentClick);
    });
</script>

<div class="filter-multi-select" bind:this={rootEl}>
    <button
        type="button"
        class="trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        on:click|stopPropagation={() => (open = !open)}
    >
        <span class="prefix">Filters:</span>
        <span class="value" bind:this={valueEl}>{label}</span>
        <span class="chevron" class:open aria-hidden="true" />
    </button>

    {#if open}
        <div
            class="panel"
            role="group"
            aria-label="Custom filters"
            style:left="{panelLeft}px"
        >
            {#if filters.length === 0}
                <span class="empty">No custom filters defined</span>
            {:else}
                {#each filters as item (item.id)}
                    {@const selected = activeIds.has(item.id)}
                    <button
                        type="button"
                        class="option"
                        class:selected
                        aria-pressed={selected}
                        on:click={() => toggle(item.id)}
                    >
                        {#if selected}
                            <span class="dot" aria-hidden="true" />
                        {/if}
                        <span class="name">{item.name}</span>
                    </button>
                {/each}
            {/if}
        </div>
    {/if}
</div>

<style lang="scss">
    .filter-multi-select {
        position: relative;
        display: inline-flex;
    }

    .trigger {
        display: inline-flex;
        align-items: center;
        gap: 0.35em;
        margin: 0;
        padding: 0;
        border: none;
        background: none;
        font-family: "Open sans", sans-serif;
        font-size: 1em;
        color: #ddd;
        cursor: pointer;
        user-select: none;

        &:focus {
            outline: none;
        }

        &:focus-visible {
            border-radius: 0.2em;
            background: #ffffff10;
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
        border-right: 2px solid #ccc;
        border-bottom: 2px solid #ccc;
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
        position: absolute;
        top: calc(100% + 0.35em);
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 0.15em;
        min-width: max(100%, 8em);
        max-width: 20em;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 0.35em;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    }

    .option {
        display: flex;
        align-items: center;
        gap: 0.45em;
        margin: 0;
        padding: 0.5em 0.7em 0.5em 1em;
        border: none;
        background: none;
        font-family: inherit;
        font-size: inherit;
        color: #ddd;
        cursor: pointer;
        white-space: nowrap;
        text-align: left;
        border-radius: 0.2em;

        &:hover {
            background: #ffffff10;
        }

        &:focus {
            outline: none;
        }

        &:focus-visible {
            background: #ffffff14;
        }

        &.selected {
            padding-left: 0.55em;
        }
    }

    .dot {
        flex-shrink: 0;
        width: 0.42em;
        height: 0.42em;
        border-radius: 50%;
        background: #5b9cf5;
    }

    .name {
        line-height: 1.3;
    }

    .empty {
        color: #999;
        font-size: 0.95em;
        padding: 0.5em 0.7em;
    }
</style>
