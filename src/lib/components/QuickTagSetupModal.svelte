<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Modal from "$lib/items/Modal.svelte";
    import Button from "$lib/items/Button.svelte";
    import OptionSelect from "$lib/items/OptionSelect.svelte";
    import TagPillRow from "$lib/components/TagPillRow.svelte";
    import TagPickerPopup from "$lib/components/TagPickerPopup.svelte";
    import TagModal from "$lib/components/TagModal.svelte";
    import type { BulkTagMode } from "$lib/stores/bulkStore";
    import { tagsStore, upsertTagDefinition } from "$lib/stores/tagsStore";
    import { DEFAULT_TAG_COLOR } from "$lib/types/tags";
    import { notify } from "$lib/components/Notifier.svelte";

    const tagModes = ["add", "remove", "replace"] as const;

    const dispatch = createEventDispatcher<{
        start: { mode: BulkTagMode; tags: string[] };
        close: void;
    }>();

    export let tagMode: BulkTagMode = "add";
    export let selectedTags: string[] = [];

    let tagPickerOpen = false;
    let tagModalOpen = false;
    let modalTagName = "";
    let modalTagColor = DEFAULT_TAG_COLOR;
    let tagsRowEl: HTMLDivElement | undefined;

    $: availableTags = $tagsStore.tags
        .map((tag) => tag.name)
        .filter((name) => !selectedTags.includes(name));

    function close() {
        dispatch("close");
    }

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

    function start() {
        if (!selectedTags.length) {
            notify("Select at least one tag", "warn");
            return;
        }
        dispatch("start", { mode: tagMode, tags: selectedTags });
    }
</script>

<Modal {close}>
    <h1>Quick tag</h1>
    <p class="subtitle">Click images to apply tags. The current search stays active.</p>

    <div class="select-field">
        <span class="field-label">Mode</span>
        <OptionSelect options={tagModes} bind:value={tagMode} />
    </div>

    <div class="select-field">
        <span class="field-label">Tags</span>
        <div class="tags-row" bind:this={tagsRowEl}>
            <TagPillRow
                tags={selectedTags}
                showAdd
                deletable
                on:add={toggleTagPicker}
                on:remove={(event) => removeTag(event.detail)}
            />
        </div>
    </div>

    <div class="buttons">
        <Button on:click={start}>Start</Button>
        <Button on:click={close}>Cancel</Button>
    </div>
</Modal>

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
    h1 {
        margin: 0 0 0.25em;
    }

    .subtitle {
        margin-top: 0;
        color: #aaa;
        font-size: 0.9em;
    }

    .select-field {
        margin-bottom: 0.75em;
    }

    .field-label {
        display: block;
        margin-bottom: 0.35em;
        color: #ccc;
    }

    .tags-row {
        min-height: 1.5em;
    }

    .buttons {
        display: flex;
        gap: 1em;
        justify-content: center;
        margin-top: 1em;
    }
</style>
