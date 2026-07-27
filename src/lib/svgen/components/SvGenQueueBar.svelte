<script lang="ts">
    import { createEventDispatcher, onDestroy, tick } from 'svelte';
    import { bindDropdownOutsideClick } from '$lib/tools/dropdownOutsideClick';
    import type { SvgenOpenSession, SvgenProgress, SvgenWorkflowSummary } from '$lib/svgen/types';

    export let progress: SvgenProgress | null;
    export let busy = false;
    export let queueActive = 0;
    export let queueOpen = false;
    export let workflows: SvgenWorkflowSummary[] = [];
    export let openSessions: SvgenOpenSession[] = [];
    export let activeSessionId: string | null = null;
    export let currentName = '';
    export let empty = false;

    const dispatch = createEventDispatcher<{
        save: void;
        download: void;
        openInComfy: void;
        toggleQueue: void;
        switchSession: string;
        closeSession: string;
        openSaved: string;
        deleteSaved: string;
    }>();

    let open = false;
    let burgerOpen = false;
    let rootEl: HTMLDivElement;
    let burgerEl: HTMLDivElement;
    let panelLeft = 0;
    let panelTop = 0;
    let panelMinWidth = 0;
    let panelMaxHeight = 0;
    let burgerLeft = 0;
    let burgerTop = 0;
    let burgerMinWidth = 0;
    let removeOutside: (() => void) | undefined;
    let removeBurgerOutside: (() => void) | undefined;
    let removePositionListeners: (() => void) | undefined;

    $: pct = progress && progress.max > 0
        ? Math.round((progress.value / progress.max) * 100)
        : 0;

    function updatePanelPosition() {
        if (!rootEl)
            return;
        const rect = rootEl.getBoundingClientRect();
        const gap = 5;
        panelLeft = rect.left;
        panelTop = rect.bottom + gap;
        panelMinWidth = Math.max(rect.width, 16 * 16);
        panelMaxHeight = Math.max(120, window.innerHeight - rect.bottom - 8);
    }

    function updateBurgerPosition() {
        if (!burgerEl)
            return;
        const rect = burgerEl.getBoundingClientRect();
        const gap = 5;
        burgerMinWidth = Math.max(rect.width, 9 * 16);
        burgerLeft = Math.max(8, rect.right - burgerMinWidth);
        burgerTop = rect.bottom + gap;
    }

    function startPositionListeners() {
        stopPositionListeners();
        const update = () => {
            if (open)
                updatePanelPosition();
            if (burgerOpen)
                updateBurgerPosition();
        };
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        removePositionListeners = () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }

    function stopPositionListeners() {
        removePositionListeners?.();
        removePositionListeners = undefined;
    }

    function syncMenuListeners() {
        removeOutside?.();
        removeOutside = undefined;
        removeBurgerOutside?.();
        removeBurgerOutside = undefined;

        if (open) {
            removeOutside = bindDropdownOutsideClick(
                () => open,
                () => {
                    open = false;
                    syncMenuListeners();
                },
                () => rootEl,
            );
            void tick().then(() => {
                updatePanelPosition();
                startPositionListeners();
            });
            return;
        }

        if (burgerOpen) {
            removeBurgerOutside = bindDropdownOutsideClick(
                () => burgerOpen,
                () => {
                    burgerOpen = false;
                    syncMenuListeners();
                },
                () => burgerEl,
            );
            void tick().then(() => {
                updateBurgerPosition();
                startPositionListeners();
            });
            return;
        }

        stopPositionListeners();
    }

    function setSessionMenuOpen(next: boolean) {
        open = next;
        if (next)
            burgerOpen = false;
        syncMenuListeners();
    }

    function setBurgerMenuOpen(next: boolean) {
        burgerOpen = next;
        if (next)
            open = false;
        syncMenuListeners();
    }

    function toggleMenu() {
        setSessionMenuOpen(!open);
    }

    function toggleBurger() {
        setBurgerMenuOpen(!burgerOpen);
    }

    function onSwitch(id: string) {
        setSessionMenuOpen(false);
        dispatch('switchSession', id);
    }

    function onCloseSession(id: string, event: MouseEvent) {
        event.stopPropagation();
        dispatch('closeSession', id);
    }

    function onOpenSaved(id: string) {
        setSessionMenuOpen(false);
        dispatch('openSaved', id);
    }

    function onDeleteSaved(id: string, event: MouseEvent) {
        event.stopPropagation();
        dispatch('deleteSaved', id);
    }

    function onDownload() {
        setBurgerMenuOpen(false);
        dispatch('download');
    }

    function onOpenInComfy() {
        setBurgerMenuOpen(false);
        dispatch('openInComfy');
    }

    onDestroy(() => {
        removeOutside?.();
        removeBurgerOutside?.();
        stopPositionListeners();
    });
</script>

<div class="bar">
    <div class="row">
        <div class="session" class:placeholder={empty} bind:this={rootEl}>
            <button
                type="button"
                class="session-trigger"
                class:open
                title="Open sessions and saved workflows"
                on:click={toggleMenu}
            >
                <span class="label">{empty ? 'No workflow' : currentName}</span>
                {#if !empty}
                    <span class="n">{openSessions.length}</span>
                {/if}
                <span class="chev" class:up={open} aria-hidden="true" />
            </button>

            {#if open}
                <div
                    class="menu"
                    style={`left: ${panelLeft}px; top: ${panelTop}px; min-width: ${panelMinWidth}px; max-height: ${panelMaxHeight}px;`}
                    role="listbox"
                >
                    {#if openSessions.length}
                        <div class="section">Open</div>
                        {#each openSessions as sess (sess.id)}
                            <div class="item" class:on={sess.id === activeSessionId}>
                                <button
                                    type="button"
                                    class="item-main"
                                    on:click={() => onSwitch(sess.id)}
                                >
                                    <span class="name">{sess.name}</span>
                                </button>
                                <button
                                    type="button"
                                    class="x"
                                    title="Close"
                                    on:click={(e) => onCloseSession(sess.id, e)}
                                >×</button>
                            </div>
                        {/each}
                    {:else}
                        <div class="muted">No workflows open</div>
                    {/if}

                    <div class="sep" />
                    <div class="section">Saved</div>
                    {#if workflows.length}
                        {#each workflows as wf (wf.id)}
                            <div class="item">
                                <button
                                    type="button"
                                    class="item-main"
                                    on:click={() => onOpenSaved(wf.id)}
                                >
                                    <span class="name">{wf.name}</span>
                                </button>
                                <button
                                    type="button"
                                    class="x"
                                    title="Delete saved"
                                    on:click={(e) => onDeleteSaved(wf.id, e)}
                                >×</button>
                            </div>
                        {/each}
                    {:else}
                        <div class="muted">No saved workflows</div>
                    {/if}
                </div>
            {/if}
        </div>

        <button type="button" disabled={empty} on:click={() => dispatch('save')} title="Save">
            Save
        </button>
        <button
            type="button"
            class="queue-btn"
            class:active={queueOpen}
            aria-label={`Show queue, ${queueActive} active`}
            on:click={() => dispatch('toggleQueue')}
        >
            <span>Queue</span>
            <span class="count">{queueActive}</span>
        </button>
        <div class="burger" bind:this={burgerEl}>
            <button
                type="button"
                class="burger-btn"
                class:open={burgerOpen}
                aria-label="More actions"
                title="More"
                disabled={empty}
                on:click={toggleBurger}
            >
                <span class="burger-icon" aria-hidden="true">
                    <span /><span /><span />
                </span>
            </button>
            {#if burgerOpen}
                <div
                    class="menu burger-menu"
                    style={`left: ${burgerLeft}px; top: ${burgerTop}px; min-width: ${burgerMinWidth}px;`}
                    role="menu"
                >
                    <button type="button" class="menu-action" role="menuitem" on:click={onOpenInComfy}>
                        Open in Comfy
                    </button>
                    <button type="button" class="menu-action" role="menuitem" on:click={onDownload}>
                        JSON
                    </button>
                </div>
            {/if}
        </div>
    </div>

    <div class="progress" class:busy>
        <div class="fill" style={`width: ${busy || progress ? pct : 0}%`} />
    </div>
</div>

<style lang="scss">
    .bar {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.55rem 0.75rem 0.35rem;
        background: color-mix(in srgb, var(--bg) 90%, var(--glass));
        flex-shrink: 0;
    }

    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem;
    }

    .session {
        flex: 1 1 8rem;
        min-width: 0;
        position: relative;
    }

    .session-trigger {
        appearance: none;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.35rem;
        border: none;
        border-radius: 7px;
        background: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        color: inherit;
        padding: 0.28rem 0.45rem 0.28rem 0.55rem;
        font-size: 0.8rem;
        cursor: pointer;
        text-align: left;

        &:focus {
            outline: none;
        }

        &:focus-visible,
        &.open {
            box-shadow:
                inset 0 1px 4px rgba(0, 0, 0, 0.55),
                0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
        }
    }

    .session.placeholder .session-trigger {
        color: var(--muted);
    }

    .label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .n {
        font-size: 0.65rem;
        color: var(--muted);
        background: rgba(0, 0, 0, 0.28);
        border-radius: 4px;
        padding: 0.05rem 0.3rem;
        flex-shrink: 0;
    }

    .chev {
        flex-shrink: 0;
        width: 0.35em;
        height: 0.35em;
        border-right: 2px solid var(--muted);
        border-bottom: 2px solid var(--muted);
        transform: rotate(45deg);
        margin-top: -0.15em;
        opacity: 0.7;
        transition: transform 0.15s ease;

        &.up {
            transform: rotate(-135deg);
            margin-top: 0.1em;
        }
    }

    .menu {
        position: fixed;
        z-index: 230;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        overflow-y: auto;
        padding: 0.3rem;
        background: color-mix(in srgb, var(--bg-elev) 92%, #000);
        border: 1px solid var(--line);
        border-radius: 9px;
        box-shadow: 0 12px 32px #000a;
        scrollbar-width: thin;
        scrollbar-color: #ffffff28 transparent;

        &::-webkit-scrollbar {
            width: 6px;
            height: 6px;
            background-color: transparent;
        }

        &::-webkit-scrollbar-track {
            background-color: transparent;
        }

        &::-webkit-scrollbar-thumb {
            background-color: #ffffff28;
            border-radius: 999px;
        }

        &::-webkit-scrollbar-thumb:hover {
            background-color: #ffffff40;
        }
    }

    .section {
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
        padding: 0.35rem 0.45rem 0.15rem;
    }

    .item {
        display: flex;
        align-items: center;
        gap: 0.15rem;
        border-radius: 6px;
        padding-right: 0.15rem;

        &:hover,
        &.on {
            background: color-mix(in srgb, var(--accent) 18%, transparent);
        }
    }

    .item-main {
        appearance: none;
        display: flex;
        align-items: center;
        flex: 1;
        min-width: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        padding: 0.4rem 0.45rem;
        font-size: 0.8rem;
        cursor: pointer;
        text-align: left;

        .name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    .x {
        appearance: none;
        border: none;
        background: transparent;
        color: inherit;
        opacity: 0.35;
        font-size: 0.85rem;
        padding: 0.2rem 0.35rem;
        border-radius: 4px;
        line-height: 1;
        flex-shrink: 0;
        cursor: pointer;

        &:hover {
            opacity: 1;
            background: #fff1;
        }
    }

    .sep {
        height: 1px;
        background: var(--line);
        margin: 0.3rem 0.2rem;
    }

    .muted {
        padding: 0.45rem;
        font-size: 0.75rem;
        color: var(--muted);
        text-align: center;
    }

    .row > button {
        appearance: none;
        border: none;
        border-radius: 0.4em;
        background: var(--accent-soft);
        color: inherit;
        padding: 0.3rem 0.55rem;
        font-size: 0.8rem;
        cursor: pointer;
        transition: background-color 0.08s ease;

        &:hover:not(:disabled) {
            background: rgba(196, 165, 116, 0.24);
        }

        &:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }
    }

    .queue-btn {
        display: inline-flex;
        align-items: baseline;
        gap: 0.3rem;

        &.active {
            background: rgba(196, 165, 116, 0.28);
            color: var(--accent);
        }

        .count {
            font-size: 0.72rem;
            opacity: 0.7;
            font-weight: 500;
        }
    }

    .burger {
        position: relative;
        flex-shrink: 0;
    }

    .burger-btn {
        appearance: none;
        display: grid;
        place-items: center;
        width: 1.85rem;
        height: 1.85rem;
        padding: 0;
        border: none;
        border-radius: 0.4em;
        background: var(--accent-soft);
        color: inherit;
        cursor: pointer;
        transition: background-color 0.08s ease;

        &:hover:not(:disabled) {
            background: rgba(196, 165, 116, 0.24);
        }

        &.open {
            background: rgba(196, 165, 116, 0.28);
            color: var(--accent);
        }

        &:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }
    }

    .burger-icon {
        display: flex;
        flex-direction: column;
        gap: 3px;
        width: 0.85rem;

        span {
            display: block;
            height: 1.5px;
            border-radius: 1px;
            background: currentColor;
        }
    }

    .menu-action {
        appearance: none;
        display: block;
        width: 100%;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        padding: 0.45rem 0.55rem;
        font-size: 0.8rem;
        cursor: pointer;
        text-align: left;

        &:hover {
            background: color-mix(in srgb, var(--accent) 18%, transparent);
        }
    }

    .progress {
        height: 3px;
        border-radius: 2px;
        background: color-mix(in srgb, var(--line) 70%, transparent);
        overflow: hidden;
    }

    .fill {
        height: 100%;
        background: var(--accent);
        transition: width 0.15s linear;
    }
</style>
