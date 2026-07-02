<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Modal from "$lib/items/Modal.svelte";
    import Button from "$lib/items/Button.svelte";
    import Input from "$lib/items/Input.svelte";
    import Tag from "$lib/items/Tag.svelte";
    import {
        DEFAULT_TAG_COLOR,
        getTagNameValidationError,
        isValidHexColor,
        isValidTagName,
        normalizeHexColor,
    } from "$lib/types/tags";

    export let title = "Tag";
    export let name = "";
    export let color = DEFAULT_TAG_COLOR;
    export let canDelete = false;

    const dispatch = createEventDispatcher<{
        save: { name: string; color: string };
        delete: void;
        close: void;
    }>();

    let hexInput = color;
    let syncedColor = color;

    $: nameError = getTagNameValidationError(name);
    $: hexError = hexInput.trim() && !isValidHexColor(hexInput.trim())
        ? "Enter a valid hex color like #5b9cf5"
        : undefined;
    $: previewLabel = name.trim() || "tag preview";
    $: previewColor =
        normalizeHexColor(hexInput.trim()) ??
        normalizeHexColor(color) ??
        DEFAULT_TAG_COLOR;

    // Color picker and parent prop changes — keep hex field in sync.
    $: if (color !== syncedColor) {
        syncedColor = color;
        hexInput = color.toLowerCase();
    }

    function close() {
        dispatch("close");
    }

    function onHexInput(event: Event) {
        const raw = (event.target as HTMLInputElement).value;
        const normalized = normalizeHexColor(raw);
        if (normalized) {
            color = normalized;
            syncedColor = normalized;
        }
    }

    function save() {
        const trimmedName = name.trim();
        if (!isValidTagName(trimmedName))
            return;

        const normalizedColor = normalizeHexColor(color) ?? DEFAULT_TAG_COLOR;
        dispatch("save", { name: trimmedName, color: normalizedColor });
    }
</script>

<Modal {close}>
    <h1>{title}</h1>

    <div class="preview">
        <Tag color={previewColor} interactive={false}>{previewLabel}</Tag>
    </div>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        <span class="label-text">Name</span>
        <div class="field-control">
            <Input bind:value={name} />
        </div>
        {#if nameError}
            <span class="field-error">{nameError}</span>
        {/if}
    </label>

    <label class="color-field">
        <span class="label-text">Color</span>
        <div class="field-control color-inputs">
            <input type="color" bind:value={color} />
            <Input bind:value={hexInput} placeholder="#5b9cf5" on:input={onHexInput} />
        </div>
        {#if hexError}
            <span class="field-error">{hexError}</span>
        {/if}
    </label>

    <div class="buttons">
        <Button on:click={save}>Save</Button>
        {#if canDelete}
            <Button on:click={() => dispatch("delete")}>Delete</Button>
        {/if}
        <Button on:click={close}>Cancel</Button>
    </div>
</Modal>

<style lang="scss">
    h1 {
        margin: 0 0 0.75em;
        font-size: 1.25em;
    }

    label {
        display: grid;
        grid-template-columns: 4em minmax(0, 1fr);
        align-items: center;
        gap: 0.35em;
        margin-bottom: 0.75em;
        cursor: pointer;
        user-select: none;
    }

    .label-text {
        color: #ccc;
    }

    .field-control {
        min-width: 0;
    }

    .field-error {
        grid-column: 2;
        font-size: 0.85em;
        color: #e88;
        line-height: 1.3;
    }

    .color-inputs {
        display: flex;
        align-items: center;
        gap: 0.5em;

        input[type="color"] {
            flex-shrink: 0;
            width: 3em;
            height: 2em;
            padding: 0;
            border: 1px solid #1118;
            border-radius: 0.35em;
            background: #333;
            cursor: pointer;
        }

        :global(.input) {
            flex: 1;
            min-width: 0;
        }
    }

    .preview {
        display: flex;
        justify-content: center;
        margin: 0 0 0.85em;
    }

    .buttons {
        display: flex;
        gap: 1em;
        justify-content: center;
        margin-top: 1em;
    }
</style>
