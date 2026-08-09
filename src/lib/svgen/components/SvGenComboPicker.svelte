<script lang="ts" context="module">
    /** Survives close/reopen and field remounts (collapse/reorder). Keyed by field DOM id. */
    const rememberedFolderPaths = new Map<string, string[]>();
</script>

<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
    import { bindDropdownOutsideClick } from '$lib/tools/dropdownOutsideClick';

    export let value: string;
    export let options: string[] = [];
    export let id: string | undefined = undefined;

    const dispatch = createEventDispatcher<{ change: string }>();
    const SEARCH_MIN = 15;
    // Skip autofocus on touch — opening / navigating must not pop the soft keyboard.
    const finePointer =
        typeof matchMedia !== 'undefined'
        && matchMedia('(hover: hover) and (pointer: fine)').matches;

    type Leaf = { value: string; label: string; path: string[] };
    type Folder = { name: string; children: Map<string, Folder>; leaves: Leaf[] };
    type NavItem =
        | { kind: 'back' }
        | { kind: 'folder'; name: string }
        | { kind: 'option'; value: string; label: string };

    let open = false;
    let path: string[] = [];
    let pathKey: string | undefined;
    let query = '';
    let activeIndex = -1;
    let lastNavKey = '';
    let rootEl: HTMLDivElement;
    let triggerEl: HTMLButtonElement;
    let searchEl: HTMLInputElement | undefined;
    let listEl: HTMLDivElement | undefined;
    let menuStyle = '';
    let unbindOutside: (() => void) | undefined;

    $: leaves = buildLeaves(options);
    $: showSearch = leaves.length >= SEARCH_MIN;
    $: selectedLabel = leaves.find((l) => l.value === value)?.label ?? value;
    $: tree = buildTree(leaves);
    // Restore last submenu for this field; if none saved (refresh / first open),
    // open in the folder of the currently selected value.
    $: if (id !== pathKey) {
        pathKey = id;
        if (!id) {
            path = [];
        } else {
            const remembered = rememberedFolderPaths.get(id);
            path = remembered !== undefined
                ? remembered
                : folderPathForValue(value, leaves);
        }
    }
    // Drop stale segments if options no longer contain that folder.
    $: {
        const clamped = clampPath(tree, path);
        if (!pathsEqual(clamped, path))
            path = clamped;
    }
    $: if (id)
        rememberedFolderPaths.set(id, path);
    $: currentFolder = folderAtPath(tree, path);
    $: searchScope = leavesInSubtree(currentFolder);
    $: filteredLeaves = query.trim()
        ? searchScope
            .filter((leaf) => {
                const q = query.trim().toLowerCase();
                return leaf.label.toLowerCase().includes(q)
                    || leaf.value.toLowerCase().includes(q);
            })
            .sort((a, b) => a.label.localeCompare(b.label))
        : null;
    $: navItems = buildNavItems(filteredLeaves, path, currentFolder);
    $: navKey = navItems.map((item) => {
        if (item.kind === 'back')
            return 'back';
        if (item.kind === 'folder')
            return `folder:${item.name}`;
        return `option:${item.value}`;
    }).join('\0');
    // Reset highlight only when the visible list identity changes (not on ↑/↓).
    $: if (!open) {
        lastNavKey = '';
    } else if (navKey !== lastNavKey) {
        lastNavKey = navKey;
        const selectedIdx = navItems.findIndex(
            (item) => item.kind === 'option' && item.value === value,
        );
        activeIndex = selectedIdx >= 0 ? selectedIdx : (navItems.length ? 0 : -1);
    }
    $: if (open && activeIndex >= 0) {
        void activeIndex;
        void tick().then(scrollActiveIntoList);
    }

    /** Scroll only the menu list — `scrollIntoView` also shifts column ancestors. */
    function scrollActiveIntoList() {
        if (!listEl || activeIndex < 0)
            return;
        const item = listEl.querySelector<HTMLElement>(`[data-nav-index="${activeIndex}"]`);
        if (!item)
            return;
        const listRect = listEl.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        if (itemRect.top < listRect.top)
            listEl.scrollTop -= listRect.top - itemRect.top;
        else if (itemRect.bottom > listRect.bottom)
            listEl.scrollTop += itemRect.bottom - listRect.bottom;
    }

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

    function clampPath(root: Folder, parts: string[]): string[] {
        const valid: string[] = [];
        let node = root;
        for (const part of parts) {
            const next = node.children.get(part);
            if (!next)
                break;
            valid.push(part);
            node = next;
        }
        return valid;
    }

    function pathsEqual(a: string[], b: string[]): boolean {
        return a.length === b.length && a.every((part, i) => part === b[i]);
    }

    /** Parent folder segments for a combo value (`a/b/file.safetensors` → `['a','b']`). */
    function folderPathForValue(raw: string, items: Leaf[]): string[] {
        const leaf = items.find((l) => l.value === raw);
        if (leaf)
            return leaf.path.slice();
        const parts = String(raw ?? '').replace(/\\/g, '/').split('/').filter(Boolean);
        if (parts.length <= 1)
            return [];
        return parts.slice(0, -1);
    }

    /** Leaves in this folder and all nested folders (current submenu scope). */
    function leavesInSubtree(folder: Folder): Leaf[] {
        const out: Leaf[] = [...folder.leaves];
        for (const child of folder.children.values())
            out.push(...leavesInSubtree(child));
        return out;
    }

    function buildNavItems(
        filtered: Leaf[] | null,
        folderPath: string[],
        folder: Folder,
    ): NavItem[] {
        if (filtered) {
            return filtered.map((leaf) => ({
                kind: 'option' as const,
                value: leaf.value,
                label: leaf.label,
            }));
        }
        const items: NavItem[] = [];
        if (folderPath.length)
            items.push({ kind: 'back' });
        for (const name of [...folder.children.keys()].sort())
            items.push({ kind: 'folder', name });
        for (const leaf of folder.leaves)
            items.push({ kind: 'option', value: leaf.value, label: leaf.label });
        return items;
    }

    function moveActive(delta: number) {
        if (!navItems.length)
            return;
        if (activeIndex < 0) {
            activeIndex = delta > 0 ? 0 : navItems.length - 1;
            return;
        }
        activeIndex = Math.max(0, Math.min(navItems.length - 1, activeIndex + delta));
    }

    function activateActive() {
        const item = navItems[activeIndex];
        if (!item)
            return;
        if (item.kind === 'back') {
            void goBack();
            return;
        }
        if (item.kind === 'folder') {
            void enterFolder(item.name);
            return;
        }
        pick(item.value);
    }

    function onMenuKeydown(event: KeyboardEvent) {
        if (!open)
            return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveActive(1);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveActive(-1);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            activateActive();
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            triggerEl?.focus({ preventScroll: true });
        }
    }

    function close() {
        if (!open)
            return;
        open = false;
        // Keep `path` so reopen lands in the same submenu; Back still works.
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
        focusSearch();
        window.addEventListener('resize', reposition);
        document.addEventListener('scroll', reposition, true);
    }

    function focusSearch() {
        if (!finePointer || !showSearch)
            return;
        // Menu is position:fixed but still under the column scroll root; default
        // focus scrolling would jump the Generate panel.
        searchEl?.focus({ preventScroll: true });
    }

    async function enterFolder(folderName: string) {
        path = [...path, folderName];
        await tick();
        focusSearch();
    }

    async function goBack() {
        path = path.slice(0, -1);
        await tick();
        focusSearch();
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
        <div
            class="menu"
            style={menuStyle}
            role="listbox"
            on:keydown={onMenuKeydown}
        >
            {#if showSearch}
                <div class="search-row">
                    <input
                        class="search"
                        type="search"
                        placeholder="Search..."
                        bind:this={searchEl}
                        bind:value={query}
                        on:pointerdown|stopPropagation
                    />
                </div>
            {/if}
            <div class="list" bind:this={listEl}>
                {#if filteredLeaves && !filteredLeaves.length}
                    <div class="empty">No matches.</div>
                {:else}
                    {#each navItems as item, index}
                        {#if item.kind === 'back'}
                            <button
                                type="button"
                                class="back"
                                class:active={index === activeIndex}
                                data-nav-index={index}
                                tabindex="-1"
                                on:click={() => void goBack()}
                            >
                                Back: {path[path.length - 1]}
                            </button>
                        {:else if item.kind === 'folder'}
                            <button
                                type="button"
                                class="folder"
                                class:active={index === activeIndex}
                                data-nav-index={index}
                                tabindex="-1"
                                on:click={() => void enterFolder(item.name)}
                            >
                                <span>{item.name}</span>
                                <span class="folder-chevron" aria-hidden="true" />
                            </button>
                        {:else}
                            <button
                                type="button"
                                class="option"
                                class:selected={item.value === value}
                                class:active={index === activeIndex}
                                data-nav-index={index}
                                tabindex="-1"
                                on:click={() => pick(item.value)}
                            >
                                {item.label}
                            </button>
                        {/if}
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
        border: none;
        border-radius: 7px;
        background: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        color: var(--ink);
        font: inherit;
        font-size: 0.78rem;
        line-height: 1.25;
        cursor: pointer;

        &:hover {
            background: rgba(0, 0, 0, 0.28);
        }
    }

    .picker.open .trigger {
        box-shadow:
            inset 0 1px 4px rgba(0, 0, 0, 0.55),
            0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
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
        border: none;
        border-radius: 0.35em;
        background: var(--bg-elev);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
    }

    .search-row {
        padding: 2px;
        flex: 0 0 auto;
    }

    .search {
        width: 100%;
        box-sizing: border-box;
        border: none;
        border-radius: 7px;
        padding: 5px 7px;
        background: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        color: var(--ink);
        font: inherit;
        font-size: 0.78rem;
        outline: 0;

        &:focus {
            box-shadow:
                inset 0 1px 4px rgba(0, 0, 0, 0.55),
                0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
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
        border-radius: 0.2em;
        background: transparent;
        color: var(--ink);
        text-align: left;
        padding: 6px 8px;
        font: inherit;
        font-size: 0.78rem;
        cursor: pointer;

        &:hover {
            background: rgba(255, 255, 255, 0.06);
        }

        &.active {
            background: color-mix(in srgb, var(--accent) 22%, transparent);
        }
    }

    .option.selected {
        color: var(--accent);

        &:not(.active) {
            background: rgba(255, 255, 255, 0.06);
        }
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
        font-size: 0.78rem;
        color: var(--muted);
    }
</style>
