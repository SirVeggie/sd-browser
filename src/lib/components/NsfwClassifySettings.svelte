<script lang="ts">
    import TagModal from "$lib/components/TagModal.svelte";
    import TagPickerPopup from "$lib/components/TagPickerPopup.svelte";
    import TagPillRow from "$lib/components/TagPillRow.svelte";
    import { nsfwClassifyStore } from "$lib/stores/nsfwClassifyStore";
    import { tagsStore, upsertTagDefinition } from "$lib/stores/tagsStore";
    import { DEFAULT_TAG_COLOR } from "$lib/types/tags";
    import {
        NSFW_CLASSIFY_LABELS,
        addMappedClassifyTag,
        nsfwClassifyLabelTitles,
        removeMappedClassifyTagFromLabel,
        type NsfwClassifyLabel,
    } from "$lib/types/nsfwClassify";
    import { notify } from "./Notifier.svelte";

    let pickerLabel: NsfwClassifyLabel | undefined;
    let pickerAnchor: HTMLElement | undefined;
    const rowEls: Partial<Record<NsfwClassifyLabel, HTMLDivElement>> = {};
    let tagModalOpen = false;
    let modalTagName = "";
    let modalTagColor = DEFAULT_TAG_COLOR;
    let createForLabel: NsfwClassifyLabel | undefined;

    $: availableTags = (label: NsfwClassifyLabel) =>
        $tagsStore.tags
            .map((tag) => tag.name)
            .filter((name) => !$nsfwClassifyStore.labels[label].includes(name));

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    function bindRow(node: HTMLDivElement, label: NsfwClassifyLabel) {
        rowEls[label] = node;
        return {
            update(next: NsfwClassifyLabel) {
                if (rowEls[label] === node)
                    delete rowEls[label];
                label = next;
                rowEls[label] = node;
            },
            destroy() {
                if (rowEls[label] === node)
                    delete rowEls[label];
            },
        };
    }

    function openPicker(label: NsfwClassifyLabel) {
        pickerLabel = label;
        pickerAnchor = rowEls[label];
    }

    function closePicker() {
        pickerLabel = undefined;
    }

    function addTag(label: NsfwClassifyLabel, name: string) {
        nsfwClassifyStore.update((settings) => addMappedClassifyTag(settings, label, name));
    }

    function removeTag(label: NsfwClassifyLabel, name: string) {
        nsfwClassifyStore.update((settings) => removeMappedClassifyTagFromLabel(settings, label, name));
    }

    function openCreateTag(label: NsfwClassifyLabel) {
        createForLabel = label;
        modalTagName = "";
        modalTagColor = DEFAULT_TAG_COLOR;
        pickerLabel = undefined;
        tagModalOpen = true;
    }

    function closeCreateTag() {
        tagModalOpen = false;
        createForLabel = undefined;
    }

    function saveNewTag(event: CustomEvent<{ name: string; color: string }>) {
        const { name, color } = event.detail;
        const duplicate = $tagsStore.tags.some(
            (item) => item.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
            notify(`Tag name '${name}' already exists`, "warn");
            return;
        }
        tagsStore.update((state) => upsertTagDefinition(state, { name, color }));
        if (createForLabel)
            addTag(createForLabel, name);
        closeCreateTag();
    }
</script>

<div class="labels">
    {#each NSFW_CLASSIFY_LABELS as label (label)}
        <div class="label-row">
            <span class="label-name">{nsfwClassifyLabelTitles[label]}</span>
            <div class="tags-row" use:bindRow={label}>
                <TagPillRow
                    tags={$nsfwClassifyStore.labels[label]}
                    showAdd
                    deletable
                    on:add={() => openPicker(label)}
                    on:remove={(event) => removeTag(label, event.detail)}
                />
            </div>
        </div>
    {/each}
</div>

{#if pickerLabel}
    <div use:portal>
        <TagPickerPopup
            anchor={pickerAnchor ?? null}
            tags={availableTags(pickerLabel)}
            on:select={(event) => {
                if (pickerLabel) addTag(pickerLabel, event.detail);
            }}
            on:createNew={() => pickerLabel && openCreateTag(pickerLabel)}
            on:close={closePicker}
        />
    </div>
{/if}

{#if tagModalOpen}
    <TagModal
        title="Add tag"
        bind:name={modalTagName}
        bind:color={modalTagColor}
        on:save={saveNewTag}
        on:close={closeCreateTag}
    />
{/if}

<style lang="scss">
    .labels {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        padding-top: 0.35rem;
    }

    .label-row {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
    }

    .label-name {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--accent);
    }

    .tags-row {
        min-width: 0;
    }
</style>
