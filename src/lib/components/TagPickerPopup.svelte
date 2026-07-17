<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { fade, fly } from "svelte/transition";
    import { cubicOut } from "svelte/easing";
    import Tag from "$lib/items/Tag.svelte";
    import { tagsStore, getTagColor } from "$lib/stores/tagsStore";
    import { DEFAULT_TAG_COLOR } from "$lib/types/tags";

    export let tags: string[] = [];
    export let anchor: HTMLElement | null = null;

    const dispatch = createEventDispatcher<{
        select: string;
        createNew: void;
        close: void;
    }>();

    let rootEl: HTMLDivElement | undefined;
    let top: number | undefined = 0;
    let bottom: number | undefined = undefined;
    let left = 0;
    let openUp = false;

    function pillColor(name: string): string {
        return getTagColor($tagsStore, name) ?? DEFAULT_TAG_COLOR;
    }

    function updatePosition() {
        if (!anchor) {
            return;
        }
        const rect = anchor.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        openUp = spaceBelow < 220;

        if (openUp) {
            top = undefined;
            bottom = window.innerHeight - rect.top + 4;
        } else {
            top = rect.bottom + 4;
            bottom = undefined;
        }

        const maxLeft = Math.max(8, window.innerWidth - 8 - Math.min(24 * 16, window.innerWidth * 0.9));
        left = Math.min(Math.max(8, rect.left), maxLeft);
    }

    function close() {
        dispatch("close");
    }

    onMount(() => {
        if (rootEl) {
            document.body.appendChild(rootEl);
        }
        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            rootEl?.remove();
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    });

    $: anchor, updatePosition();
</script>

<div class="tag-picker-root" bind:this={rootEl}>
    <button
        type="button"
        class="backdrop"
        aria-label="Close tag picker"
        on:click|stopPropagation={close}
    ></button>

    <div
        class="picker"
        style:top={top === undefined ? "auto" : `${top}px`}
        style:bottom={bottom === undefined ? "auto" : `${bottom}px`}
        style:left={`${left}px`}
        transition:fly={{ y: openUp ? 8 : -8, duration: 180, easing: cubicOut }}
    >
        <div class="picker-header">
            <span class="title">select tags</span>
            <button type="button" class="add-new" on:click|stopPropagation={() => dispatch("createNew")}>
                + add new
            </button>
        </div>
        {#if tags.length}
            <div class="picker-tags">
                {#each tags as tag, index (tag)}
                    <button
                        type="button"
                        class="picker-tag-entry"
                        in:fade={{ duration: 160, delay: index * 35, easing: cubicOut }}
                        on:click|stopPropagation={() => dispatch("select", tag)}
                    >
                        <Tag color={pillColor(tag)} highlightOnHover interactive={false}>
                            {tag}
                        </Tag>
                    </button>
                {/each}
            </div>
        {:else}
            <p class="empty" in:fade={{ duration: 160, easing: cubicOut }}>All registry tags are on this image.</p>
        {/if}
    </div>
</div>

<style lang="scss">
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 200;
        margin: 0;
        padding: 0;
        border: none;
        background: transparent;
        cursor: default;
    }

    .picker {
        position: fixed;
        z-index: 201;
        min-width: min(18em, 70vw);
        max-width: min(24em, 90vw);
        max-height: min(50vh, 20rem);
        overflow-y: auto;
        background: var(--glass);
        backdrop-filter: blur(16px) saturate(1.2);
        border: none;
        border-radius: 0.5em;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        color: var(--ink);
    }

    .picker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75em;
        padding: 0.5em 0.7em;
        background: rgba(0, 0, 0, 0.22);
        border-bottom: 1px solid var(--line);
        font-size: 0.82em;
        position: sticky;
        top: 0;
        z-index: 1;
    }

    .title {
        color: var(--muted);
        text-transform: lowercase;
        user-select: none;
        font-weight: 600;
    }

    .add-new {
        appearance: none;
        border: none;
        background: none;
        color: var(--accent);
        font: inherit;
        font-size: 0.95em;
        font-weight: 600;
        cursor: pointer;
        padding: 0.15em 0.35em;
        border-radius: 0.25em;
        transition: background-color 0.12s ease, color 0.12s ease;

        &:hover {
            background: var(--accent-soft);
            color: var(--ink);
        }
    }

    .picker-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 0.55em 0.6em 0.65em;
    }

    .picker-tag-entry {
        display: inline-flex;
        appearance: none;
        margin: 0;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
        line-height: 0;
    }

    .empty {
        margin: 0;
        padding: 0.65em 0.75em;
        font-size: 0.82em;
        color: var(--muted);
    }
</style>
