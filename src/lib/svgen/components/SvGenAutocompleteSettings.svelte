<script lang="ts">
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import Button from '$lib/items/Button.svelte';
    import NumInput from '$lib/items/NumInput.svelte';
    import { askConfirmation } from '$lib/components/Confirm.svelte';
    import { notify } from '$lib/components/Notifier.svelte';
    import {
        createAutocompleteSource,
        deleteAutocompleteSource,
        listAutocompleteSources,
        updateAutocompleteSource,
    } from '$lib/svgen/autocompleteClient';
    import {
        svgenAutocompleteBehaviorStore,
        svgenAutocompleteSourcesStore,
    } from '$lib/svgen/stores';
    import type {
        AutocompleteBoundary,
        AutocompleteSource,
    } from '$lib/svgen/autocompleteTypes';

    type Draft = {
        name: string;
        path: string;
        enabledByDefault: boolean;
        boundary: AutocompleteBoundary;
    };

    const emptyDraft = (): Draft => ({
        name: '',
        path: '',
        enabledByDefault: false,
        boundary: 'comma',
    });

    export let modalOpen = false;
    export let editingId: string | null = null;
    export let draft: Draft = emptyDraft();
    export let sourceBusy = false;

    let busyId: string | null = null;
    let loading = true;
    let idleOpacityPercent = Math.round(
        get(svgenAutocompleteBehaviorStore).idleOpacity * 100,
    );
    let fadeDelaySeconds = Number(
        (get(svgenAutocompleteBehaviorStore).fadeDelayMs / 1000).toFixed(1),
    );

    $: sourceBusy = busyId !== null;
    $: {
        const percent = Math.max(4, Math.min(70, Math.round(Number(idleOpacityPercent) || 22)));
        const unit = percent / 100;
        if ($svgenAutocompleteBehaviorStore.idleOpacity !== unit) {
            svgenAutocompleteBehaviorStore.update((settings) => ({
                ...settings,
                idleOpacity: unit,
            }));
        }
    }
    $: {
        const seconds = Math.max(
            0.1,
            Math.min(10, Math.round((Number(fadeDelaySeconds) || 2) * 10) / 10),
        );
        if (fadeDelaySeconds !== seconds)
            fadeDelaySeconds = seconds;
        const ms = Math.round(seconds * 10) * 100;
        if ($svgenAutocompleteBehaviorStore.fadeDelayMs !== ms) {
            svgenAutocompleteBehaviorStore.update((settings) => ({
                ...settings,
                fadeDelayMs: ms,
            }));
        }
    }

    onMount(() => {
        void refreshSources();
    });

    async function refreshSources() {
        loading = true;
        try {
            svgenAutocompleteSourcesStore.set(await listAutocompleteSources());
        } catch (cause) {
            console.error(cause);
            notify(cause instanceof Error ? cause.message : 'Failed to load autocomplete sources', 'warn');
        } finally {
            loading = false;
        }
    }

    function openAdd() {
        editingId = null;
        draft = emptyDraft();
        modalOpen = true;
    }

    function openEdit(source: AutocompleteSource) {
        editingId = source.id;
        draft = {
            name: source.name,
            path: source.path,
            enabledByDefault: source.enabledByDefault,
            boundary: source.boundary,
        };
        modalOpen = true;
    }

    function closeModal() {
        if (busyId !== null)
            return;
        modalOpen = false;
        editingId = null;
        draft = emptyDraft();
    }

    export function closeSourceModal() {
        closeModal();
    }

    function replaceSource(source: AutocompleteSource) {
        svgenAutocompleteSourcesStore.update((sources) =>
            sources.map((item) => item.id === source.id ? source : item),
        );
    }

    export async function saveSourceDraft(next: Draft) {
        draft = next;
        if (!draft.name.trim() || !draft.path.trim()) {
            notify('Autocomplete source needs a name and file path', 'warn');
            return;
        }
        busyId = editingId ?? 'new';
        try {
            if (editingId) {
                const previous = $svgenAutocompleteSourcesStore.find((source) => source.id === editingId);
                if (!previous)
                    return;
                const source = await updateAutocompleteSource({
                    id: editingId,
                    ...draft,
                }, previous.path !== draft.path);
                replaceSource(source);
                notify(source.error
                    ? `Source saved, but could not be indexed: ${source.error}`
                    : `Updated autocomplete source '${source.name}'`,
                source.error ? 'warn' : undefined);
            } else {
                const source = await createAutocompleteSource(draft);
                svgenAutocompleteSourcesStore.update((sources) => [...sources, source]);
                notify(source.error
                    ? `Source added, but could not be indexed: ${source.error}`
                    : `Added autocomplete source '${source.name}'`,
                source.error ? 'warn' : undefined);
            }
            modalOpen = false;
            editingId = null;
            draft = emptyDraft();
        } catch (cause) {
            console.error(cause);
            notify(cause instanceof Error ? cause.message : 'Failed to save autocomplete source', 'warn');
        } finally {
            busyId = null;
        }
    }

    async function reindex(source: AutocompleteSource) {
        busyId = source.id;
        try {
            const updated = await updateAutocompleteSource(source, true);
            replaceSource(updated);
            notify(updated.error
                ? `Could not index '${updated.name}': ${updated.error}`
                : `Indexed ${updated.itemCount.toLocaleString()} items from '${updated.name}'`,
            updated.error ? 'warn' : undefined);
        } catch (cause) {
            console.error(cause);
            notify(cause instanceof Error ? cause.message : 'Failed to index source', 'warn');
        } finally {
            busyId = null;
        }
    }

    async function remove(source: AutocompleteSource) {
        if (!await askConfirmation(
            'Delete autocomplete source',
            `Delete '${source.name}' and its search index? The source file is not changed.`,
        )) {
            return;
        }
        busyId = source.id;
        try {
            await deleteAutocompleteSource(source.id);
            svgenAutocompleteSourcesStore.update((sources) =>
                sources.filter((item) => item.id !== source.id),
            );
            if (editingId === source.id)
                closeModal();
            notify(`Deleted autocomplete source '${source.name}'`);
        } catch (cause) {
            console.error(cause);
            notify(cause instanceof Error ? cause.message : 'Failed to delete source', 'warn');
        } finally {
            busyId = null;
        }
    }

    function clampBehavior() {
        svgenAutocompleteBehaviorStore.update((settings) => ({
            ...settings,
            minChars: Math.max(1, Math.min(20, Math.round(Number(settings.minChars) || 3))),
            maxRows: Math.max(1, Math.min(100, Math.round(Number(settings.maxRows) || 50))),
            idleOpacity: Math.max(0.04, Math.min(0.7, Number(settings.idleOpacity) || 0.22)),
            fadeDelayMs: Math.max(
                100,
                Math.min(10_000, Math.round((Number(settings.fadeDelayMs) || 2000) / 100) * 100),
            ),
        }));
    }
</script>

<div class="settings-group">
    <label class="checkbox">
        Auto-suggest while typing
        <input type="checkbox" bind:checked={$svgenAutocompleteBehaviorStore.autoSuggest} />
    </label>
    <label class="checkbox">
        Show item info
        <input type="checkbox" bind:checked={$svgenAutocompleteBehaviorStore.showInfo} />
    </label>
    <label class="checkbox">
        Idle fade
        <input
            type="checkbox"
            checked={$svgenAutocompleteBehaviorStore.idleFade !== false}
            on:change={(event) => svgenAutocompleteBehaviorStore.update((settings) => ({
                ...settings,
                idleFade: event.currentTarget.checked,
            }))}
        />
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label class="inline">
        Minimum characters
        <NumInput
            bind:value={$svgenAutocompleteBehaviorStore.minChars}
            on:change={clampBehavior}
        />
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label class="inline">
        Maximum results
        <NumInput
            bind:value={$svgenAutocompleteBehaviorStore.maxRows}
            on:change={clampBehavior}
        />
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label class="inline">
        Idle opacity (%)
        <NumInput bind:value={idleOpacityPercent} />
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label class="inline">
        Fade after interaction (s)
        <NumInput
            bind:value={fadeDelaySeconds}
            step={0.1}
            on:change={clampBehavior}
        />
    </label>
</div>

{#if loading}
    <p class="gray">Loading sources…</p>
{:else if !$svgenAutocompleteSourcesStore.length}
    <p class="gray">No autocomplete sources yet.</p>
{:else}
    <div class="source-list">
        {#each $svgenAutocompleteSourcesStore as source (source.id)}
            <div class="source-card" class:error={!!source.error}>
                <div class="source-header">
                    <span class="source-name">{source.name}</span>
                    {#if source.enabledByDefault}
                        <span class="badge">default</span>
                    {/if}
                    <div class="source-actions">
                        <button
                            type="button"
                            class="source-edit"
                            disabled={busyId !== null}
                            on:click={() => openEdit(source)}
                        >
                            edit
                        </button>
                        <button
                            type="button"
                            class="source-edit"
                            disabled={busyId !== null}
                            on:click={() => reindex(source)}
                        >
                            {busyId === source.id ? 'indexing…' : 'reindex'}
                        </button>
                        <button
                            type="button"
                            class="source-delete"
                            disabled={busyId !== null}
                            aria-label="Delete source {source.name}"
                            on:click={() => remove(source)}
                        >
                            ×
                        </button>
                    </div>
                </div>
                <span class="source-meta">
                    {source.itemCount.toLocaleString()} items · {source.boundary}
                </span>
                <code class="source-path" title={source.path}>{source.path}</code>
                {#if source.error}
                    <span class="error-text">{source.error}</span>
                {/if}
            </div>
        {/each}
    </div>
{/if}

<div class="inline-action">
    <Button on:click={openAdd}>Add source</Button>
</div>

<style lang="scss">
    .settings-group {
        width: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
    }

    .gray {
        font-size: 0.8em;
        color: var(--muted);
        margin: 0;
    }

    .inline-action {
        align-self: flex-start;
    }

    label {
        user-select: none;
        width: 100%;
        box-sizing: border-box;
        font-size: 0.8rem;
        color: var(--muted);
        padding: 0.45rem 0;
        border-bottom: 1px solid var(--line);

        &:last-child {
            border-bottom: none;
        }

        &.checkbox,
        &.inline {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            width: 100%;
            min-width: 0;
        }

        &.inline :global(.num) {
            flex: 0 0 auto;
            width: auto;
            max-width: 9rem;
        }
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

    .source-list {
        display: flex;
        flex-direction: column;
        gap: 0.5em;
        width: 100%;
    }

    .source-card {
        display: flex;
        flex-direction: column;
        gap: 0.3em;
        padding: 0.35em 0.45em;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.18);
        border: 1px solid var(--line);
        min-width: 0;
        width: 100%;
        box-sizing: border-box;

        &.error {
            border-color: color-mix(in srgb, var(--danger) 50%, var(--line));
        }
    }

    .source-header {
        display: flex;
        align-items: center;
        gap: 0.35em;
        min-width: 0;
    }

    .source-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.4;
    }

    .badge {
        flex-shrink: 0;
        border-radius: 999px;
        padding: 0.05rem 0.4rem;
        color: var(--accent);
        background: var(--accent-soft);
        font-size: 0.72rem;
    }

    .source-actions {
        display: flex;
        align-items: center;
        gap: 0.15em;
        flex-shrink: 0;
    }

    .source-edit,
    .source-delete {
        appearance: none;
        border: none;
        background: none;
        margin: 0;
        padding: 0;
        font: inherit;
        line-height: 1;
        cursor: pointer;
        color: var(--muted);
        transition: color 0.15s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 1.5em;
        box-sizing: border-box;

        &:disabled {
            cursor: default;
            opacity: 0.45;
        }

        &:focus {
            outline: none;
        }

        &:focus-visible {
            outline: 1px solid rgba(196, 165, 116, 0.45);
            outline-offset: 2px;
        }
    }

    .source-edit {
        font-size: 0.85em;
        padding: 0 0.35em;

        &:hover:not(:disabled) {
            color: var(--accent);
        }
    }

    .source-delete {
        font-size: 1.1em;
        width: 1.5em;

        &:hover:not(:disabled) {
            color: var(--danger);
        }
    }

    .source-meta,
    .source-path,
    .error-text {
        min-width: 0;
        font-size: 0.78rem;
        line-height: 1.35;
        color: var(--muted);
    }

    .source-path {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: inherit;
    }

    .error-text {
        color: var(--danger);
        overflow-wrap: anywhere;
    }
</style>
