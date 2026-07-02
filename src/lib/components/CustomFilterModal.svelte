<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Modal from "$lib/items/Modal.svelte";
    import Button from "$lib/items/Button.svelte";
    import Input from "$lib/items/Input.svelte";
    import { notify } from "./Notifier.svelte";

    export let title = "Custom filter";
    export let name = "";
    export let filter = "";

    const dispatch = createEventDispatcher<{
        save: { name: string; filter: string };
        close: void;
    }>();

    function close() {
        dispatch("close");
    }

    function save() {
        const trimmedName = name.trim();
        if (!trimmedName) {
            notify("Filter name is required", "warn");
            return;
        }

        dispatch("save", { name: trimmedName, filter: filter.trim() });
    }
</script>

<Modal {close}>
    <h1>{title}</h1>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Name
        <Input bind:value={name} />
    </label>

    <label>
        Filter
        <textarea bind:value={filter} rows="4" />
    </label>

    <div class="buttons">
        <Button on:click={save}>Save</Button>
        <Button on:click={close}>Cancel</Button>
    </div>
</Modal>

<style lang="scss">
    h1 {
        margin: 0 0 0.75em;
        font-size: 1.25em;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 0.35em;
        margin-bottom: 0.75em;
        cursor: pointer;
        user-select: none;
    }

    textarea {
        width: 100%;
        min-width: min(500px, 80vw);
        background-color: #333;
        color: #ddd;
        border-radius: 0.5em;
        border: 1px solid #1118;
        padding: 0.5em;
        box-sizing: border-box;
        resize: vertical;

        &:focus {
            outline: none;
            border-color: #aaad;
        }
    }

    .buttons {
        display: flex;
        gap: 1em;
        justify-content: center;
        margin-top: 1em;
    }
</style>
