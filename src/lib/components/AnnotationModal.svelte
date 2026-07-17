<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Modal from "$lib/items/Modal.svelte";
    import Button from "$lib/items/Button.svelte";

    export let title = "Edit annotation";
    export let text = "";
    export let saving = false;

    const dispatch = createEventDispatcher<{
        save: { text: string };
        close: void;
    }>();

    function close() {
        if (saving) return;
        dispatch("close");
    }

    function save() {
        if (saving) return;
        dispatch("save", { text });
    }
</script>

<Modal {close}>
    <h1>{title}</h1>

    <label>
        Annotation
        <textarea bind:value={text} rows="10" disabled={saving} />
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
        background-color: rgba(0, 0, 0, 0.28);
        color: var(--ink);
        border-radius: 9px;
        border: 1px solid var(--line);
        padding: 0.5em;
        box-sizing: border-box;
        resize: vertical;
        font-family: inherit;

        &:focus {
            outline: none;
            border-color: rgba(196, 165, 116, 0.45);
        }

        &:disabled {
            opacity: 0.7;
        }
    }

    .buttons {
        display: flex;
        gap: 1em;
        justify-content: center;
        margin-top: 1em;
    }
</style>
