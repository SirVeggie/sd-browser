<script lang="ts" context="module">
    import _ from "lodash";
    import { writable } from "svelte/store";
    import { outclick } from "../../actions/outclick";

    export type ContextReturn = void | "keep" | ContextMenuOption[];
    export type IContextMenu = {
        id: string;
        options: ContextMenuOption[];
        position: { x: number; y: number };
        parent?: string;
    };
    export type ContextMenuOption = {
        name: string;
        handler: () => ContextReturn | Promise<ContextReturn>;
        visible?: boolean;
        enabled?: boolean;
    };

    const menuStore = writable<IContextMenu[]>([]);

    export function openContextMenu(
        position: { x: number; y: number },
        options: ContextMenuOption[],
        parent?: string,
    ) {
        window.addEventListener("keydown", handleEsc);
        const id = _.uniqueId(`${parent ?? "contextmenu"}_`);
        menuStore.update((menus) => {
            menus.push({ id, options, position, parent });
            return menus;
        });
        return id;
    }

    export function handleEsc(e: KeyboardEvent) {
        if (e.key === "Escape") closeAllContextMenus();
    }

    export function closeContextMenu(id?: string) {
        menuStore.update((menus) => {
            if (id) {
                const ancestor = id.match(/^[^_]+_[^_]+/)?.[0] ?? id;
                menus = menus.filter((x) => !x.id.startsWith(ancestor));
            } else {
                menus.pop();
            }

            if (menus.length === 0)
                window.removeEventListener("keydown", handleEsc);
            return menus;
        });
    }

    export function closeAllContextMenus() {
        menuStore.set([]);
        window.removeEventListener("keydown", handleEsc);
    }
</script>

<script lang="ts">
    import { fly } from "svelte/transition";
    import { fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";

    async function clickHandler(
        e: MouseEvent,
        menu: IContextMenu,
        option: ContextMenuOption,
    ) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        const result = await option.handler();
        if (!result) return closeContextMenu(menu.id);
        if (result === "keep") return;

        const subposition = { x: e.clientX, y: e.clientY };
        openContextMenu(subposition, result, menu.id);
    }

    function hoverEnter(
        e: MouseEvent,
        menu: IContextMenu,
        option: ContextMenuOption,
    ) {}

    function hoverExit(
        e: MouseEvent,
        menu: IContextMenu,
        option: ContextMenuOption,
    ) {}

    function focusEnter(
        e: FocusEvent,
        menu: IContextMenu,
        option: ContextMenuOption,
    ) {}

    function focusExit(
        e: FocusEvent,
        menu: IContextMenu,
        option: ContextMenuOption,
    ) {}
</script>

{#each $menuStore as menu (menu.id)}
    <div
        class="contextmenu" class:disabled={!menu.options.filter((x) => x.visible ?? true).length}
        style="left: {menu.position.x + 15}px; top: {menu.position.y + 1}px"
        in:fly={{ duration: 300, x: -20, easing: cubicOut }}
        out:fade={{ duration: 300, easing: cubicOut }}
        use:outclick
        on:outclick={() => closeContextMenu(menu.id)}
    >
        {#each menu.options as option (option.name)}
            {#if option.visible ?? true}
                <button
                    on:click={(e) => clickHandler(e, menu, option)}
                    on:mouseover={(e) => hoverEnter(e, menu, option)}
                    on:mouseout={(e) => hoverExit(e, menu, option)}
                    on:focus={(e) => focusEnter(e, menu, option)}
                    on:blur={(e) => focusExit(e, menu, option)}
                    class:disabled={!(option.enabled ?? true)}
                >
                    {option.name}
                </button>
            {/if}
        {/each}
    </div>
{/each}

<svelte:window on:blur={() => closeAllContextMenus()} />

<style lang="scss">
    .contextmenu {
        flex-direction: column;
        background-color: #222a;
        border: 1px solid #ddd4;
        border-radius: 5px;
        overflow: hidden;
        min-width: 125px;

        position: fixed;
        z-index: 100;

        backdrop-filter: blur(5px);
        
        &.disabled {
            opacity: 0;
            pointer-events: none;
        }
    }

    button {
        display: block;
        appearance: none;
        border: none;
        color: #ddd;
        background-color: transparent;
        padding: 0.5em 0.75em;
        font-size: 1em;
        text-align: start;
        width: 100%;
        cursor: pointer;

        &:hover:not(.disabled) {
            background-color: #333a;
        }

        &:active:not(.disabled) {
            background-color: #444a;
        }

        &.disabled {
            color: #ddd5;
            cursor: default;
        }
    }
</style>
