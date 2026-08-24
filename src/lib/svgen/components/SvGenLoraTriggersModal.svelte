<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import Modal from '$lib/items/Modal.svelte';
    import Button from '$lib/items/Button.svelte';
    import { notify } from '$lib/components/Notifier.svelte';
    import { fetchLoraTriggers } from '$lib/svgen/comfyClient';
    import {
        triggersForLoraName,
        uniqueLoraNames,
        type LoraTriggerMap,
    } from '$lib/svgen/loraTriggers';

    export let names: string[] = [];

    const dispatch = createEventDispatcher<{ close: void }>();

    let loading = true;
    let error: string | null = null;
    let map: LoraTriggerMap = {};

    $: sections = uniqueLoraNames(names)
        .map((name) => ({ name, triggers: triggersForLoraName(name, map) }))
        .filter((section) => section.triggers.length);

    function storedComfyToken(): string | undefined {
        try {
            return sessionStorage.getItem('comfyWorkflowOpenToken')?.trim() || undefined;
        } catch {
            return undefined;
        }
    }

    onMount(async () => {
        const requested = uniqueLoraNames(names);
        if (!requested.length) {
            loading = false;
            return;
        }
        try {
            map = await fetchLoraTriggers(requested, storedComfyToken());
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Failed to load trigger words';
        } finally {
            loading = false;
        }
    });

    function close() {
        dispatch('close');
    }

    function copyText(text: string, okMessage: string) {
        if (!navigator?.clipboard?.writeText) {
            notify('Clipboard unavailable', 'warn');
            return;
        }
        navigator.clipboard.writeText(text).then(
            () => notify(okMessage),
            () => notify('Failed to copy', 'error'),
        );
    }

    function copyTrigger(word: string) {
        copyText(word, `Copied ${word}`);
    }

    function copyAll(triggers: string[]) {
        copyText(triggers.join(', '), 'Copied all triggers');
    }
</script>

<Modal {close}>
    <div class="form">
        <h1>LoRA triggers</h1>
        {#if loading}
            <p class="status">Loading…</p>
        {:else if error}
            <p class="status error">{error}</p>
        {:else if sections.length}
            <div class="sections">
                {#each sections as section (section.name)}
                    <section>
                        <h2>{section.name}</h2>
                        <div class="chips">
                            {#if section.triggers.length > 1}
                                <button
                                    type="button"
                                    class="chip all"
                                    title="Copy all triggers"
                                    on:click={() => copyAll(section.triggers)}
                                >copy all</button>
                            {/if}
                            {#each section.triggers as word, i (`${i}-${word}`)}
                                <button
                                    type="button"
                                    class="chip"
                                    on:click={() => copyTrigger(word)}
                                >{word}</button>
                            {/each}
                        </div>
                    </section>
                {/each}
            </div>
        {:else}
            <p class="status">No loras with trigger words found</p>
        {/if}
        <div class="buttons">
            <Button on:click={close}>Close</Button>
        </div>
    </div>
</Modal>

<style lang="scss">
    .form {
        width: 500px;
        max-width: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        min-height: calc(150px - 2em);
    }

    h1 {
        margin: 0 0 0.65em;
        font-size: 1.25em;
    }

    h2 {
        margin: 0 0 0.4em;
        font-size: 0.85em;
        font-weight: 600;
        word-break: break-all;
    }

    .sections {
        display: flex;
        flex-direction: column;
        gap: 0.85em;
        margin-bottom: 0.85em;
        max-height: min(60vh, 28rem);
        overflow-y: auto;
    }

    .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
    }

    .chip {
        appearance: none;
        margin: 0;
        border: none;
        border-radius: 5px;
        padding: 0.28rem 0.45rem;
        background: rgba(0, 0, 0, 0.22);
        color: inherit;
        font: inherit;
        font-size: 0.72rem;
        line-height: 1.2;
        cursor: pointer;

        &:hover {
            filter: brightness(1.12);
        }

        &.all {
            background: #ffffff05;
            border: dashed 1px var(--accent-soft);
        }
    }

    .status {
        margin: 0 0 0.85em;
        font-size: 0.85em;
        color: var(--muted);
    }

    .status.error {
        color: var(--danger);
    }

    .buttons {
        display: flex;
        gap: 1em;
        justify-content: center;
        margin-top: auto;
    }
</style>
