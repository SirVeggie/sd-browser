<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import Modal from '$lib/items/Modal.svelte';
    import Button from '$lib/items/Button.svelte';
    import Input from '$lib/items/Input.svelte';
    import Select from '$lib/items/Select.svelte';
    import type { AutocompleteBoundary } from '$lib/svgen/autocompleteTypes';

    export let title = 'Add autocomplete source';
    export let name = '';
    export let path = '';
    export let enabledByDefault = false;
    export let boundary: AutocompleteBoundary = 'comma';
    export let saveLabel = 'Add and index';
    export let busy = false;

    const boundaryOptions = [
        { value: 'comma', label: 'Comma-separated phrase' },
        { value: 'word', label: 'Current word' },
    ];

    const dispatch = createEventDispatcher<{
        save: {
            name: string;
            path: string;
            enabledByDefault: boolean;
            boundary: AutocompleteBoundary;
        };
        close: void;
    }>();

    function close() {
        if (busy)
            return;
        dispatch('close');
    }

    function save() {
        if (busy)
            return;
        dispatch('save', {
            name,
            path,
            enabledByDefault,
            boundary,
        });
    }
</script>

<Modal {close}>
    <div class="form">
        <h1>{title}</h1>
        <p class="help">
            Files stay in place and are read by the server. Paste an absolute path; browsers cannot
            expose a dropped file's path. JSON arrays, Danbooru JSON, a1111 CSV, and CSV-style text
            are supported. The search index refreshes when the file's modified time changes.
        </p>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label>
            Name
            <Input bind:value={name} placeholder="Booru tags" />
        </label>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label>
            File path
            <Input bind:value={path} placeholder="V:\ai\misc\prompting\tags.json" />
        </label>

        <div class="select-field">
            <span>Completion boundary</span>
            <Select
                id="autocomplete-source-boundary"
                bind:value={boundary}
                options={boundaryOptions}
            />
        </div>

        <label class="checkbox">
            Enabled by default on unconfigured cards
            <input type="checkbox" bind:checked={enabledByDefault} />
        </label>

        <div class="buttons">
            <Button on:click={save}>{busy ? 'Indexing…' : saveLabel}</Button>
            <Button on:click={close}>Cancel</Button>
        </div>
    </div>
</Modal>

<style lang="scss">
    .form {
        width: 500px;
        max-width: 100%;
        box-sizing: border-box;
    }

    h1 {
        margin: 0 0 0.75em;
        font-size: 1.25em;
    }

    .help {
        margin: 0 0 1em;
        color: var(--muted);
        font-size: 0.8em;
        line-height: 1.4;
    }

    label:not(.checkbox) {
        display: flex;
        flex-direction: column;
        gap: 0.35em;
        margin-bottom: 0.75em;
        cursor: pointer;
        user-select: none;
    }

    .select-field,
    .checkbox {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        margin-bottom: 0.75em;
        font-size: 0.8rem;
        color: var(--muted);
        user-select: none;
    }

    .select-field :global(.select) {
        margin-left: auto;
        justify-content: flex-end;
    }

    .checkbox {
        cursor: pointer;
    }

    input[type='checkbox'] {
        appearance: none;
        width: 2.2rem;
        height: 1.2rem;
        margin: 0;
        padding: 0;
        border-radius: 999px;
        border: none;
        background: #2a2420;
        cursor: pointer;
        position: relative;
        flex-shrink: 0;
        outline: none;
        transition: background-color 0.18s ease;

        &::before {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 0.9rem;
            height: 0.9rem;
            border-radius: 50%;
            background: #f0e6d8;
            transform: translateX(0);
            transition: transform 0.18s ease, background-color 0.18s ease;
        }

        &:checked {
            background: rgba(196, 165, 116, 0.35);
        }

        &:checked::before {
            transform: translateX(calc(2.2rem - 0.9rem - 4px));
            background: var(--accent);
        }

        &:focus-visible {
            outline: 1px solid rgba(196, 165, 116, 0.45);
            outline-offset: 2px;
        }
    }

    .buttons {
        display: flex;
        gap: 1em;
        justify-content: center;
        margin-top: 1em;
    }
</style>
