<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Modal from "$lib/items/Modal.svelte";
    import Button from "$lib/items/Button.svelte";
    import {
        searchKeywordHelpSections,
        type SearchKeywordHelpEntry,
    } from "$lib/types/misc";

    const dispatch = createEventDispatcher<{
        close: void;
    }>();

    let expandedKey: string | null = null;

    function entryKey(sectionTitle: string, entry: SearchKeywordHelpEntry): string {
        return `${sectionTitle}::${entry.keyword}`;
    }

    function toggle(key: string) {
        expandedKey = expandedKey === key ? null : key;
    }

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

        <div class="sections compact-scrollbar">
            {#each searchKeywordHelpSections as section (section.title)}
                <section class="help-section">
                    <h2>{section.title}</h2>
                    <div class="keyword-list">
                        {#each section.entries as entry (entry.keyword)}
                            {@const key = entryKey(section.title, entry)}
                            {@const details = "details" in entry ? entry.details : undefined}
                            {@const expandable = !!details}
                            {@const open = expandedKey === key}
                            <button
                                type="button"
                                class="keyword-card"
                                class:expandable
                                class:expanded={open}
                                aria-expanded={expandable ? open : undefined}
                                disabled={!expandable}
                                on:click={() => expandable && toggle(key)}
                            >
                                <div class="card-top">
                                    <div class="keyword-title">
                                        {#each entry.keyword.split(/[|\s]+/).filter(Boolean) as alias (alias)}
                                            <code>{alias}</code>
                                        {/each}
                                    </div>
                                    {#if expandable}
                                        <span class="chevron" class:open aria-hidden="true" />
                                    {/if}
                                </div>
                                <p class="summary">{entry.summary}</p>
                                {#if open && details}
                                    <p class="details">{details}</p>
                                {/if}
                                <p class="example">
                                    <span>Example:</span>
                                    <code>{entry.example}</code>
                                </p>
                            </button>
                        {/each}
                    </div>
                </section>
            {/each}
        </div>
    </div>
</Modal>

<style lang="scss">
    .keyword-help {
        width: 100%;
        max-width: 850px;
        max-height: min(850px, calc(100dvh - 6em));
        display: flex;
        flex-direction: column;
        gap: 1em;
        box-sizing: border-box;
        overflow: hidden;
        min-width: 0;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1em;
        flex-shrink: 0;
        min-width: 0;
    }

    .header > div {
        min-width: 0;
        flex: 1 1 auto;
    }

    h1 {
        margin: 0 0 0.35em;
        font-size: 1.35em;
        color: var(--ink);
    }

    h2 {
        margin: 0;
        font-size: 1em;
        font-weight: 600;
        color: var(--muted);
    }

    p {
        margin: 0;
        color: var(--muted);
        line-height: 1.4;
    }

    code {
        font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas,
            monospace;
        color: var(--keyword);
        background: rgba(0, 0, 0, 0.28);
        border-radius: 3px;
        padding: 0.1em 0.35em;
    }

    .sections {
        display: flex;
        flex-direction: column;
        gap: 1.25em;
        overflow-x: hidden;
        overflow-y: auto;
        min-height: 0;
        min-width: 0;
        flex: 1 1 auto;
        padding-right: 0.15em;
    }

    .help-section {
        display: flex;
        flex-direction: column;
        gap: 0.55em;
        min-width: 0;
    }

    .keyword-list {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.75em;
    }

    @media (width >= 700px) {
        .keyword-list:has(> :nth-child(2)) {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    .keyword-card {
        display: flex;
        flex-direction: column;
        gap: 0.45em;
        padding: 0.75em;
        border: 1px solid var(--line);
        border-radius: 0.5em;
        background: rgba(255, 255, 255, 0.03);
        text-align: left;
        color: inherit;
        font: inherit;
        box-sizing: border-box;
        min-width: 0;
        appearance: none;
        width: 100%;
        cursor: default;

        &.expandable {
            cursor: pointer;

            &:hover {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(235, 228, 216, 0.16);
            }

            &.expanded {
                border-color: rgba(196, 165, 116, 0.4);
                background: var(--accent-soft);
            }
        }

        &:focus {
            outline: none;
        }

        &:focus-visible {
            outline: 1px solid var(--accent);
            outline-offset: 2px;
        }

        &:disabled {
            opacity: 1;
        }
    }

    .card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5em;
    }

    .keyword-title {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35em;
        min-width: 0;
    }

    .chevron {
        flex-shrink: 0;
        width: 0.4em;
        height: 0.4em;
        margin-top: 0.35em;
        border-right: 2px solid var(--muted);
        border-bottom: 2px solid var(--muted);
        transform: rotate(-45deg);
        transition: transform 0.2s ease;

        &.open {
            transform: rotate(45deg);
            margin-top: 0.45em;
        }
    }

    .summary {
        color: var(--ink);
        font-weight: 600;
    }

    .details {
        color: var(--muted);
        font-size: 0.95em;
    }

    .example {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4em;
        align-items: baseline;
        color: var(--muted);
        font-size: 0.9em;
    }
</style>
