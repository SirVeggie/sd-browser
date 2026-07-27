<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import Modal from '$lib/items/Modal.svelte';
    import Button from '$lib/items/Button.svelte';
    import Input from '$lib/items/Input.svelte';
    import { notify } from '$lib/components/Notifier.svelte';

    export let initialName = '';
    /** Saved workflow names currently in the library (for overwrite warning). */
    export let savedNames: string[] = [];

    const dispatch = createEventDispatcher<{
        save: string;
        close: void;
    }>();

    let name = initialName;
    $: name = initialName;

    $: overwriteTarget = (() => {
        const trimmed = name.trim();
        if (!trimmed)
            return null;
        return savedNames.find((n) => n === trimmed) ?? null;
    })();

    function close() {
        dispatch('close');
    }

    function save() {
        const trimmed = name.trim();
        if (!trimmed) {
            notify('Workflow name is required', 'warn');
            return;
        }
        dispatch('save', trimmed);
    }
</script>

<Modal {close}>
    <div class="form">
        <h1>Save workflow</h1>
        <p class="sub">Sessions aren’t linked to the library. Saving writes under this name.</p>

        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label>
            Name
            <Input bind:value={name} />
        </label>

        {#if overwriteTarget}
            <p class="overwrite">
                A saved workflow named “{overwriteTarget}” already exists. Saving will overwrite it.
            </p>
        {/if}

        <div class="buttons">
            <Button on:click={save}>Save</Button>
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
        margin: 0 0 0.35em;
        font-size: 1.25em;
    }

    .sub {
        margin: 0 0 0.85em;
        font-size: 0.85em;
        color: var(--muted);
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 0.35em;
        margin-bottom: 0.35em;
        cursor: pointer;
        user-select: none;
    }

    .overwrite {
        margin: 0 0 0.85em;
        font-size: 0.82em;
        color: var(--danger);
    }

    .buttons {
        display: flex;
        justify-content: flex-end;
        gap: 0.5em;
        margin-top: 0.75em;
    }
</style>
