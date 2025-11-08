<script lang="ts" context="module">
    import { outclick } from "../../actions/outclick";
</script>

<script lang="ts">
    import {
        closeContextMenu,
        closeContextMenuChildren,
        openContextMenu,
        type ContextMenuOption,
        type IContextMenu,
    } from "./ContextMenuManager.svelte";
    import { fly } from "svelte/transition";
    import { fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";
    import { onMount } from "svelte";

    export let menu: IContextMenu;

    let element: HTMLDivElement;
    let position = menu.position;

    $: {
        if (element) {
            const rect = element.getBoundingClientRect();
            if (rect.right > window.innerWidth - 30) {
                position.x =
                    menu.position.x - (rect.right - window.innerWidth + 35);
            }
            if (rect.bottom > window.innerHeight - 10) {
                position.y =
                    menu.position.y - (rect.bottom - window.innerHeight + 11);
            }
        }
    }

    onMount(() => {});

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
        closeContextMenuChildren(menu.id);
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

<div
    bind:this={element}
    class="contextmenu"
    class:disabled={!menu.options.filter((x) => x.visible ?? true).length}
    style="left: {position.x + 15}px; top: {position.y + 1}px"
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

<style lang="scss">
    .contextmenu {
        flex-direction: column;
        background-color: #222a;
        border: 1px solid #ddd4;
        border-radius: 5px;
        overflow-y: auto;
        min-width: 125px;
        max-height: calc(100vh - 50px);

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
        white-space: nowrap;
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
