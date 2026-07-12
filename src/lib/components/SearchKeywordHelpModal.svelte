<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Modal from "$lib/items/Modal.svelte";
    import Button from "$lib/items/Button.svelte";
    import { searchKeywordHelp } from "$lib/types/misc";

    const dispatch = createEventDispatcher<{
        close: void;
    }>();

    function close() {
        dispatch("close");
    }
</script>

<Modal {close}>
    <div class="keyword-help">
        <div class="header">
            <div>
                <h1>Search keywords</h1>
                <p>
                    Keywords go at the start of a search clause. Combine clauses with
                    <code>AND</code>, and prefix a literal keyword with a backslash if you
                    want to search for the word itself.
                </p>
            </div>
            <Button on:click={close}>Close</Button>
        </div>

        <div class="keyword-list">
            {#each searchKeywordHelp as entry (entry.keyword)}
                <section class="keyword-card">
                    <div class="keyword-title">
                        {#each entry.keyword.split("|") as alias (alias)}
                            <code>{alias}</code>
                        {/each}
                    </div>
                    <p class="summary">{entry.summary}</p>
                    <p>{entry.details}</p>
                    <p class="example">
                        <span>Example:</span>
                        <code>{entry.example}</code>
                    </p>
                </section>
            {/each}
        </div>
    </div>
</Modal>

<style lang="scss">
    .keyword-help {
        width: min(850px, calc(100vw - 2em));
        display: flex;
        flex-direction: column;
        gap: 1em;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1em;
    }

    h1 {
        margin: 0 0 0.35em;
        font-size: 1.35em;
    }

    p {
        margin: 0;
        color: #ccc;
        line-height: 1.4;
    }

    code {
        font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas,
            monospace;
        color: #8fd3ff;
        background: #00000033;
        border-radius: 3px;
        padding: 0.1em 0.35em;
    }

    .keyword-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
        gap: 0.75em;
    }

    .keyword-card {
        display: flex;
        flex-direction: column;
        gap: 0.45em;
        padding: 0.75em;
        border: 1px solid #aaa3;
        border-radius: 0.5em;
        background: #ffffff06;
    }

    .keyword-title {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35em;
    }

    .summary {
        color: #eee;
        font-weight: 600;
    }

    .example {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4em;
        align-items: baseline;
        color: #aaa;
        font-size: 0.9em;
    }
</style>
