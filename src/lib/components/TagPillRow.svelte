<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Tag from "$lib/items/Tag.svelte";
    import { tagsStore, getTagColor } from "$lib/stores/tagsStore";
    import { DEFAULT_TAG_COLOR } from "$lib/types/tags";

    export let tags: string[] = [];
    export let showAdd = false;
    export let deletable = false;
    export let clickable = false;
    export let selectable = false;
    export let selectedTags: string[] = [];
    export let disabled = false;
    export let compact = true;

    const dispatch = createEventDispatcher<{
        add: void;
        remove: string;
        edit: string;
        toggle: string;
    }>();

    function pillColor(name: string): string {
        return getTagColor($tagsStore, name) ?? DEFAULT_TAG_COLOR;
    }

    function isSelected(name: string): boolean {
        return selectedTags.includes(name);
    }

    function onPillClick(name: string) {
        if (disabled)
            return;
        if (selectable) {
            dispatch("toggle", name);
            return;
        }
        if (clickable) {
            dispatch("edit", name);
            return;
        }
        if (deletable)
            dispatch("remove", name);
    }
</script>

<div class="tag-row" class:compact>
    {#each tags as tag (tag)}
        <Tag
            color={pillColor(tag)}
            selected={selectable && isSelected(tag)}
            {deletable}
            {disabled}
            on:click={() => onPillClick(tag)}
        >
            {tag}
        </Tag>
    {/each}
    {#if showAdd}
        <Tag add {disabled} on:click={() => dispatch("add")} />
    {/if}
</div>

<style lang="scss">
    .tag-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;

        &.compact {
            gap: 6px;
        }
    }
</style>
