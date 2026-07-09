<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Modal from "$lib/items/Modal.svelte";
    import Button from "$lib/items/Button.svelte";
    import OptionSelect from "$lib/items/OptionSelect.svelte";
    import type { BulkTagMode } from "$lib/stores/bulkStore";

    const tagModes = ["add", "remove", "replace"] as const;

    const dispatch = createEventDispatcher<{
        start: { mode: BulkTagMode };
        close: void;
    }>();

    export let tagMode: BulkTagMode = "add";

    function close() {
        dispatch("close");
    }

    function start() {
        dispatch("start", { mode: tagMode });
    }
</script>

<Modal {close}>
    <h1>Quick tag</h1>
    <p class="subtitle">Click images to apply tags. The current search stays active.</p>

    <div class="select-field">
        <span class="field-label">Mode</span>
        <OptionSelect options={tagModes} bind:value={tagMode} />
    </div>

    <div class="buttons">
        <Button on:click={start}>Start</Button>
        <Button on:click={close}>Cancel</Button>
    </div>
</Modal>

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

    .buttons {
        display: flex;
        gap: 1em;
        justify-content: center;
        margin-top: 1em;
    }
</style>
