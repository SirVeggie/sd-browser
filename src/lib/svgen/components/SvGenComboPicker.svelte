<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
    import { bindDropdownOutsideClick } from '$lib/tools/dropdownOutsideClick';

    export let value: string;
    export let options: string[] = [];
    export let id: string | undefined = undefined;

    const dispatch = createEventDispatcher<{ change: string }>();
    const SEARCH_MIN = 15;

    type Leaf = { value: string; label: string; path: string[] };
    type Folder = { name: string; children: Map<string, Folder>; leaves: Leaf[] };

    let open = false;
    let path: string[] = [];
    let query = '';
    let rootEl: HTMLDivElement;
    let triggerEl: HTMLButtonElement;
    let menuStyle = '';
    let unbindOutside: (() => void) | undefined;

    $: leaves = buildLeaves(options);
    $: showSearch = leaves.length >= SEARCH_MIN;
    $: selectedLabel = leaves.find((l) => l.value === value)?.label ?? value;
    $: tree = buildTree(leaves);
    $: currentFolder = folderAtPath(tree, path);
    $: filteredLeaves = query.trim()
        ? leaves
            .filter((leaf) => {
                const q = query.trim().toLowerCase();
                return leaf.label.toLowerCase().includes(q)
                    || leaf.value.toLowerCase().includes(q);
            })
            .sort((a, b) => a.label.localeCompare(b.label))
        : null;

    function buildLeaves(values: string[]): Leaf[] {
        return values.map((raw) => {
            const parts = String(raw).replace(/\\/g, '/').split('/').filter(Boolean);
            const label = parts.length ? parts[parts.length - 1] : String(raw);
            return { value: String(raw), label, path: parts.slice(0, -1) };
        });
    }

    function buildTree(items: Leaf[]): Folder {
        const root: Folder = { name: '', children: new Map(), leaves: [] };
        for (const leaf of items) {
            let node = root;
            for (const folder of leaf.path) {
                let next = node.children.get(folder);
                if (!next) {
                    next = { name: folder, children: new Map(), leaves: [] };
                    node.children.set(folder, next);
                }
                node = next;
            }
            node.leaves.push(leaf);
        }
        return root;
    }

    function folderAtPath(root: Folder, parts: string[]): Folder {
        let node = root;
        for (const part of parts) {
            const next = node.children.get(part);
            if (!next)
                return node;
            node = next;
        }
        return node;
    }

    function close() {
        if (!open)
            return;
        open = false;
        path = [];
        query = '';
        menuStyle = '';
        window.removeEventListener('resize', reposition);
        document.removeEventListener('scroll', reposition, true);
    }

    function reposition() {
        if (!open || !triggerEl)
            return;
        const gap = 8;
        const preferredMaxWidth = 320;
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
        // Wider than a narrow field — same rule as original panel (cap 320).
        const width = Math.min(
            maxPossibleWidth,
            Math.max(rect.width, Math.min(preferredMaxWidth, maxPossibleWidth)),
        );
        let left = rect.left;
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
            `min-width:${Math.round(Math.min(Math.max(rect.width, 96), width))}px`,
            `max-width:${Math.round(width)}px`,
            `max-height:${Math.round(height)}px`,
        ].join(';');
    }

    async function openMenu() {
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

    function pick(next: string) {
        dispatch('change', next);
        close();
    }

    onMount(() => {
        unbindOutside = bindDropdownOutsideClick(
            () => open,
            close,
            () => rootEl,
        );
        return () => unbindOutside?.();
    });

    onDestroy(close);
</script>

<div class="picker" class:open bind:this={rootEl}>
    <button
        type="button"
        class="trigger"
        {id}
        bind:this={triggerEl}
        aria-haspopup="listbox"
        aria-expanded={open}
        on:click={openMenu}
    >
        <span class="label">{selectedLabel || '—'}</span>
        <span class="chevron" aria-hidden="true" />
    </button>

    {#if open}
        <div class="menu" style={menuStyle} role="listbox">
            {#if showSearch}
                <div class="search-row">
                    <input
                        class="search"
                        type="search"
                        placeholder="Search..."
                        bind:value={query}
                        on:pointerdown|stopPropagation
                    />
                </div>
            {/if}
            <div class="list">
                {#if filteredLeaves}
                    {#if !filteredLeaves.length}
                        <div class="empty">No matches.</div>
                    {:else}
                        {#each filteredLeaves as leaf}
                            <button
                                type="button"
                                class="option"
                                class:selected={leaf.value === value}
                                on:click={() => pick(leaf.value)}
                            >
                                {leaf.label}
                            </button>
                        {/each}
                    {/if}
                {:else}
                    {#if path.length}
                        <button
                            type="button"
                            class="back"
                            on:click={() => (path = path.slice(0, -1))}
                        >
                            Back: {path[path.length - 1]}
                        </button>
                    {/if}
                    {#each [...currentFolder.children.keys()].sort() as folderName}
                        <button
                            type="button"
                            class="folder"
                            on:click={() => (path = [...path, folderName])}
                        >
                            <span>{folderName}</span>
                            <span class="folder-chevron" aria-hidden="true" />
                        </button>
                    {/each}
                    {#each currentFolder.leaves as leaf}
                        <button
                            type="button"
                            class="option"
                            class:selected={leaf.value === value}
                            on:click={() => pick(leaf.value)}
                        >
                            {leaf.label}
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .picker {
        position: relative;
        width: 100%;
        min-width: 0;
    }

    .trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
        min-height: 24px;
        padding: 3px 6px;
        text-align: left;
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--bg-elev);
        color: var(--ink);
        font: inherit;
        font-size: 11px;
        line-height: 1.25;
        cursor: pointer;

        &:hover {
            border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
            background: color-mix(in srgb, var(--bg-elev) 85%, var(--bg));
        }
    }

    .picker.open .trigger {
        border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
        background: var(--bg);
    }

    .label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .chevron {
        width: 0;
        height: 0;
        flex: 0 0 auto;
        border-inline: 4px solid transparent;
        border-top: 5px solid color-mix(in srgb, var(--ink) 55%, transparent);
    }

    .menu {
        display: flex;
        flex-direction: column;
        gap: 4px;
        box-sizing: border-box;
        overflow: hidden;
        padding: 4px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--bg-elev);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
    }

    .search-row {
        padding: 2px;
        flex: 0 0 auto;
    }

    .search {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 5px 7px;
        background: var(--bg);
        color: var(--ink);
        font: inherit;
        font-size: 11px;
        outline: 0;

        &:focus {
            border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
        }
    }

    .list {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .option,
    .folder,
    .back {
        appearance: none;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--ink);
        text-align: left;
        padding: 6px 8px;
        font: inherit;
        font-size: 11px;
        cursor: pointer;

        &:hover {
            background: var(--accent-soft);
        }
    }

    .option.selected {
        background: var(--accent-soft);
        color: var(--accent);
    }

    .folder {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: var(--muted);
        font-weight: 600;
    }

    .folder-chevron {
        width: 0;
        height: 0;
        border-block: 4px solid transparent;
        border-left: 5px solid color-mix(in srgb, var(--ink) 45%, transparent);
    }

    .back {
        color: var(--muted);
        font-weight: 600;
    }

    .empty {
        padding: 8px;
        font-size: 11px;
        color: var(--muted);
    }
</style>
