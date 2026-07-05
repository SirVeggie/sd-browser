<script lang="ts" context="module">
    import { outclick } from "../../actions/outclick";
</script>

<script lang="ts">
    import {
        cancelContextMenuHoverClose,
        closeContextMenu,
        closeContextMenuChildren,
        openContextMenu,
        scheduleContextMenuHoverClose,
        type ContextMenuOption,
        type IContextMenu,
    } from "./ContextMenuManager.svelte";

    export let menu: IContextMenu;
    export let depth = 0;

    let element: HTMLDivElement;
    let position = { ...menu.position };
    let flipLeft = false;
    let activeSubmenuOption: string | null = null;

    const finePointerHover =
        typeof matchMedia !== "undefined" &&
        matchMedia("(hover: hover) and (pointer: fine)").matches;

    $: isSubmenu = menu.parent !== undefined;

    $: if (menu) {
        position = { ...menu.position };
        flipLeft = false;
        activeSubmenuOption = null;
    }

    $: {
        if (element) {
            const rect = element.getBoundingClientRect();
            flipLeft = false;

            if (rect.right > window.innerWidth - 8) {
                if (menu.position.parentLeft !== undefined) {
                    position.x = menu.position.parentLeft - rect.width;
                    flipLeft = true;
                } else {
                    position.x =
                        menu.position.x - (rect.right - window.innerWidth + 8);
                }
            }

            if (rect.bottom > window.innerHeight - 8) {
                position.y =
                    menu.position.y - (rect.bottom - window.innerHeight + 8);
            }
        }
    }

    async function openSubmenu(
        button: HTMLButtonElement,
        menu: IContextMenu,
        option: ContextMenuOption,
    ) {
        if (!(option.enabled ?? true) || !option.submenu) return;

        const buttonRect = button.getBoundingClientRect();
        const menuRect = element.getBoundingClientRect();

        const result = await option.handler();
        if (!result) {
            activeSubmenuOption = null;
            closeContextMenuChildren(menu.id);
            return;
        }
        if (result === "keep") return;

        const subposition = {
            x: menuRect.right,
            y: buttonRect.top,
            parentLeft: menuRect.left,
        };
        closeContextMenuChildren(menu.id);
        openContextMenu(subposition, result, menu.id);
    }

    function optionEnter(
        e: MouseEvent,
        menu: IContextMenu,
        option: ContextMenuOption,
    ) {
        if (!finePointerHover) return;

        cancelContextMenuHoverClose();

        if (option.submenu) {
            if (activeSubmenuOption === option.name) return;
            activeSubmenuOption = option.name;
            openSubmenu(e.currentTarget as HTMLButtonElement, menu, option);
            return;
        }

        activeSubmenuOption = null;
        closeContextMenuChildren(menu.id);
    }

    async function clickHandler(
        e: MouseEvent,
        menu: IContextMenu,
        option: ContextMenuOption,
    ) {
        if (e.button !== 0) return;
        if (!(option.enabled ?? true)) return;
        e.stopPropagation();
        e.preventDefault();

        if (option.submenu) {
            cancelContextMenuHoverClose();
            if (activeSubmenuOption === option.name) return;
            activeSubmenuOption = option.name;
            await openSubmenu(e.currentTarget as HTMLButtonElement, menu, option);
            return;
        }

        closeContextMenu(menu.id);
        await option.handler();
    }

    function menuEnter() {
        if (!finePointerHover) return;
        cancelContextMenuHoverClose();
    }

    function menuLeave() {
        if (!finePointerHover) return;
        scheduleContextMenuHoverClose(menu.parent ?? menu.id);
    }
</script>

<div
    bind:this={element}
    class="contextmenu"
    class:submenu={isSubmenu}
    class:flip-left={flipLeft}
    class:disabled={!menu.options.filter((x) => x.visible ?? true).length}
    style="left: {position.x}px; top: {position.y}px; z-index: {100 + depth}"
    role="menu"
    aria-label={isSubmenu ? "Submenu" : "Context menu"}
    tabindex="-1"
    use:outclick
    on:outclick={() => closeContextMenu(menu.id)}
    on:mouseenter={menuEnter}
    on:mouseleave={menuLeave}
>
    {#each menu.options as option, index (option.name)}
        {#if option.visible ?? true}
            <button
                type="button"
                role="menuitem"
                style="--stagger-i: {index}"
                disabled={!(option.enabled ?? true)}
                aria-haspopup={option.submenu ? "menu" : undefined}
                aria-expanded={option.submenu
                    ? activeSubmenuOption === option.name
                    : undefined}
                on:mouseenter={(e) => optionEnter(e, menu, option)}
                on:click={(e) => clickHandler(e, menu, option)}
                class:disabled={!(option.enabled ?? true)}
                class:has-submenu={option.submenu}
            >
                <span class="label">{option.name}</span>
                {#if option.submenu}
                    <span class="submenu-chevron" aria-hidden="true" />
                {/if}
            </button>
        {/if}
    {/each}
</div>

<style lang="scss">
    @use "./dropdownAnimations.scss" as dropdown;

    .contextmenu {
        display: flex;
        flex-direction: column;
        gap: 0.12em;
        padding: 0.2em;
        background: rgba(18, 18, 18, 0.82);
        border-radius: 0.35em;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        overflow-y: auto;
        min-width: 7.5em;
        max-height: calc(100vh - 16px);

        position: fixed;

        backdrop-filter: blur(8px);
        transform-origin: top left;
        @include dropdown.panel-animation;
        @include dropdown.reduced-motion;

        &.submenu {
            transform-origin: left center;

            &.flip-left {
                transform-origin: right center;
            }
        }

        &.disabled {
            opacity: 0;
            pointer-events: none;
        }
    }

    button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1.25em;
        appearance: none;
        border: none;
        color: #ddd;
        background-color: transparent;
        white-space: nowrap;
        padding: 0.38em 0.55em;
        font-size: 0.92em;
        text-align: start;
        width: 100%;
        cursor: pointer;
        border-radius: 0.2em;
        @include dropdown.option-animation;
        @include dropdown.reduced-motion;

        &:hover:not(.disabled):not(:disabled) {
            background: #ffffff10;
        }

        &:active:not(.disabled):not(:disabled) {
            background: #ffffff14;
        }

        &.disabled,
        &:disabled {
            color: #999;
            cursor: default;
        }
    }

    .label {
        flex: 1;
        min-width: 0;
    }

    .submenu-chevron {
        flex-shrink: 0;
        width: 0.35em;
        height: 0.35em;
        border-right: 2px solid #888;
        border-bottom: 2px solid #888;
        transform: rotate(-45deg);
    }
</style>
