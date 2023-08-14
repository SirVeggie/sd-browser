<script lang="ts" context="module">
    import { uniqueId } from "lodash";
    import { writable } from "svelte/store";
    import { outclick } from "../../actions/outclick";

    export type ContextReturn = void | "keep" | string[];
    export type IContextMenu = {
        id: string;
        options: string[];
        handler: (option: string) => ContextReturn;
        position: { x: number; y: number };
    };

    const menuStore = writable<IContextMenu[]>([]);

    export function openContextMenu(
        options: string[],
        position: { x: number; y: number },
        handler: (option: string) => ContextReturn
    ) {
        window.addEventListener("keydown", handleEsc);
        const id = uniqueId("contextmenu_");
        menuStore.update((menus) => {
            menus.push({ id, options, handler, position });
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
                const index = menus.findIndex((m) => m.id === id);
                if (index !== -1) menus.splice(index, 1);
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

    function baseHandler(e: MouseEvent, menu: IContextMenu, option: string) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        const result = menu.handler(option);
        if (!result) return closeContextMenu(menu.id);
        if (result === "keep") return;

        const subposition = { x: e.clientX, y: e.clientY };
        openContextMenu(result, subposition, menu.handler);
    }
</script>

{#each $menuStore as menu (menu.id)}
    <div
        class="contextmenu"
        style="left: {menu.position.x + 15}px; top: {menu.position.y + 1}px"
        in:fly={{ duration: 300, x: -20, easing: cubicOut }}
        out:fade={{ duration: 300, easing: cubicOut }}
        use:outclick
        on:outclick={() => closeContextMenu(menu.id)}
    >
        {#each menu.options as option (option)}
            <button on:click={(e) => baseHandler(e, menu, option)}>
                {option}
            </button>
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

        &:hover {
            background-color: #333a;
        }

        &:active {
            background-color: #444a;
        }
    }
</style>
