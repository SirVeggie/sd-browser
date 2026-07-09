<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Button from "$lib/items/Button.svelte";
    import TagPillRow from "$lib/components/TagPillRow.svelte";
    import TagPickerPopup from "$lib/components/TagPickerPopup.svelte";
    import TagModal from "$lib/components/TagModal.svelte";
    import type { BulkTagMode } from "$lib/stores/bulkStore";
    import { tagsStore, upsertTagDefinition } from "$lib/stores/tagsStore";
    import { DEFAULT_TAG_COLOR } from "$lib/types/tags";
    import { notify } from "$lib/components/Notifier.svelte";

    const dispatch = createEventDispatcher<{
        undo: void;
        revert: void;
        done: void;
    }>();

    export let tagMode: BulkTagMode = "add";
    export let selectedTags: string[] = [];
    export let canUndo = false;
    export let canRevert = false;

    let tagPickerOpen = false;
    let tagModalOpen = false;
    let modalTagName = "";
    let modalTagColor = DEFAULT_TAG_COLOR;
    let tagsRowEl: HTMLDivElement | undefined;

    $: availableTags = $tagsStore.tags
        .map((tag) => tag.name)
        .filter((name) => !selectedTags.includes(name));

    function addTag(name: string) {
        if (selectedTags.includes(name)) return;
        selectedTags = [...selectedTags, name];
    }

    function removeTag(name: string) {
        selectedTags = selectedTags.filter((tag) => tag !== name);
    }

    function toggleTagPicker() {
        tagPickerOpen = !tagPickerOpen;
    }

    function closeTagPicker() {
        tagPickerOpen = false;
    }

    function openCreateTagModal() {
        modalTagName = "";
        modalTagColor = DEFAULT_TAG_COLOR;
        tagModalOpen = true;
    }

    function closeCreateTagModal() {
        tagModalOpen = false;
    }

    async function saveNewTag(event: CustomEvent<{ name: string; color: string }>) {
        const { name, color } = event.detail;
        const duplicate = $tagsStore.tags.some(
            (item) => item.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
            notify(`Tag name '${name}' already exists`, "warn");
            return;
        }

        tagsStore.update((state) => upsertTagDefinition(state, { name, color }));
        tagModalOpen = false;
        addTag(name);
    }
</script>

<div class="quick-tag-toolbar">
    <span class="mode-label">{tagMode}</span>
    <div class="tags-row" bind:this={tagsRowEl}>
        <TagPillRow
            tags={selectedTags}
            showAdd
            deletable
            on:add={toggleTagPicker}
            on:remove={(event) => removeTag(event.detail)}
        />
    </div>
    <div class="actions">
        <Button disabled={!canUndo} on:click={() => dispatch("undo")}>Undo</Button>
        <Button disabled={!canRevert} on:click={() => dispatch("revert")}>Revert</Button>
        <Button on:click={() => dispatch("done")}>Done</Button>
    </div>
</div>

{#if tagPickerOpen}
    <TagPickerPopup
        anchor={tagsRowEl ?? null}
        tags={availableTags}
        on:select={(event) => addTag(event.detail)}
        on:createNew={openCreateTagModal}
        on:close={closeTagPicker}
    />
{/if}

{#if tagModalOpen}
    <TagModal
        title="Add tag"
        bind:name={modalTagName}
        bind:color={modalTagColor}
        on:save={saveNewTag}
        on:close={closeCreateTagModal}
    />
{/if}

<style lang="scss">
    .quick-tag-toolbar {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        gap: 0.5em;
        align-items: center;
    }

    .mode-label {
        flex-shrink: 0;
        font-size: 0.8em;
        color: rgb(63, 187, 236);
        text-transform: capitalize;
        user-select: none;
    }

    .tags-row {
        flex: 1 1 0;
        min-width: 0;
    }

    .actions {
        display: flex;
        gap: 0.5em;
        flex-shrink: 0;
    }
</style>
