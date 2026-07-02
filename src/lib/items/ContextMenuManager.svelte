<script lang="ts" context="module">
    import _ from "lodash";
    import { writable } from "svelte/store";

    export type ContextReturn = void | "keep" | ContextMenuOption[];
    export type ContextMenuPosition = {
        x: number;
        y: number;
        /** Parent menu left edge; used to flip submenus when they overflow the viewport. */
        parentLeft?: number;
    };
    export type IContextMenu = {
        id: string;
        options: ContextMenuOption[];
        position: ContextMenuPosition;
        parent?: string;
    };
    export type ContextMenuOption = {
        name: string;
        handler: () => ContextReturn | Promise<ContextReturn>;
        visible?: boolean;
        enabled?: boolean;
        submenu?: boolean;
    };

    const menuStore = writable<IContextMenu[]>([]);

    export function openContextMenu(
        position: ContextMenuPosition,
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

    /** Closes all menus that are part of the same tree (finds root menu and closes all of its children) */
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

    export function closeContextMenuChildren(id: string | undefined) {
        if (!id) return;
        menuStore.update((menus) =>
            menus.filter((x) => !x.id.startsWith(`${id}_`)),
        );
    }

    export function closeAllContextMenus() {
        menuStore.set([]);
        window.removeEventListener("keydown", handleEsc);
    }
</script>

<script lang="ts">
    import ContextMenu from "./ContextMenu.svelte";
</script>

{#each $menuStore as menu, index (menu.id)}
    <ContextMenu {menu} depth={index} />
{/each}

<svelte:window on:blur={() => closeAllContextMenus()} />
