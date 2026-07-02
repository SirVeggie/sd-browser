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

    let top = 0;
    let left = 0;

    function pillColor(name: string): string {
        return getTagColor($tagsStore, name) ?? DEFAULT_TAG_COLOR;
    }

    function updatePosition() {
        if (!anchor)
            return;
        const rect = anchor.getBoundingClientRect();
        top = rect.bottom + 4;
        left = rect.left;
    }

    function close() {
        dispatch("close");
    }

    onMount(() => {
        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    });

    $: anchor, updatePosition();
</script>

<button
    type="button"
    class="backdrop"
    aria-label="Close tag picker"
    on:click|stopPropagation={close}
></button>

<div
    class="picker"
    style={`top: ${top}px; left: ${left}px`}
    transition:fly={{ y: -8, duration: 180, easing: cubicOut }}
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
                <span
                    class="picker-tag-entry"
                    in:fade={{ duration: 160, delay: index * 35, easing: cubicOut }}
                    on:click|stopPropagation={() => dispatch("select", tag)}
                >
                    <Tag color={pillColor(tag)} highlightOnHover>
                        {tag}
                    </Tag>
                </span>
            {/each}
        </div>
    {:else}
        <p class="empty" in:fade={{ duration: 160, easing: cubicOut }}>All registry tags are on this image.</p>
    {/if}
</div>

<style lang="scss">
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 101;
        margin: 0;
        padding: 0;
        border: none;
        background: transparent;
        cursor: default;
    }

    .picker {
        position: fixed;
        z-index: 102;
        min-width: min(18em, 70vw);
        max-width: min(24em, 90vw);
        background: #1a1a1ef0;
        border: 1px solid #fff2;
        border-radius: 0.45em;
        box-shadow: 0 0.35em 1em #0008;
        overflow: hidden;
    }

    .picker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75em;
        padding: 0.45em 0.6em;
        background: #112a;
        border-bottom: 1px solid #fff1;
        font-size: 0.82em;
    }

    .title {
        color: #ccc;
        text-transform: lowercase;
        user-select: none;
    }

    .add-new {
        appearance: none;
        border: none;
        background: none;
        color: rgb(63, 187, 236);
        font: inherit;
        font-size: 0.95em;
        cursor: pointer;
        padding: 0.15em 0.25em;
        border-radius: 0.25em;

        &:hover {
            background: rgb(63 187 236 / 12%);
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
    }

    .empty {
        margin: 0;
        padding: 0.65em 0.75em;
        font-size: 0.82em;
        color: #aaa;
    }
</style>
