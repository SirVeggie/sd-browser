<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Tag from "$lib/items/Tag.svelte";
    import SortableList from "$lib/components/SortableList.svelte";
    import DragHandle from "$lib/components/DragHandle.svelte";
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
    export let sortable = false;

    const dispatch = createEventDispatcher<{
        add: void;
        remove: string;
        edit: string;
        toggle: string;
        reorder: { from: number; to: number; ids: string[] };
    }>();

    function pillColor(name: string): string {
        return getTagColor($tagsStore, name) ?? DEFAULT_TAG_COLOR;
    }

    function isSelected(name: string): boolean {
        return selectedTags.includes(name);
    }

    function onPillClick(name: string) {
        if (disabled) return;
        if (selectable) {
            dispatch("toggle", name);
            return;
        }
        if (clickable) {
            dispatch("edit", name);
            return;
        }
        if (deletable) dispatch("remove", name);
    }
</script>

{#if sortable}
    <div class="tag-row" class:compact>
        <SortableList
            ids={tags}
            axis="xy"
            {disabled}
            on:reorder={(event) => dispatch("reorder", event.detail)}
            let:id
            let:startDrag
        >
            <div class="sortable-pill">
                <DragHandle
                    label="Drag to reorder {id}"
                    {disabled}
                    on:pointerdown={startDrag}
                />
                <Tag
                    color={pillColor(id)}
                    selected={selectable && isSelected(id)}
                    {deletable}
                    {disabled}
                    on:click={() => onPillClick(id)}
                >
                    {id}
                </Tag>
            </div>
            <svelte:fragment slot="trailing">
                {#if showAdd}
                    <div class="add-slot">
                        <Tag add {disabled} on:click={() => dispatch("add")} />
                    </div>
                {/if}
            </svelte:fragment>
        </SortableList>
    </div>
{:else}
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
{/if}

<style lang="scss">
    .tag-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;

        &.compact {
            gap: 6px;
        }

        :global(.sortable-list) {
            width: 100%;
            gap: 6px;
            align-items: center;
        }

        :global(.sortable-item),
        :global(.sortable-item-body) {
            display: flex;
            align-items: center;
            height: 23px;
        }
    }

    .sortable-pill {
        display: flex;
        align-items: center;
        gap: 2px;
        height: 23px;
    }

    .add-slot {
        display: flex;
        align-items: center;
        height: 23px;
    }

    .sortable-pill :global(.drag-handle) {
        width: 14px;
        height: 23px;
    }
</style>
