<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from 'svelte';
    import {
        buildComfyViewPath,
        fetchAuthorizedBlobUrl,
        invalidateAuthorizedBlobUrl,
        peekAuthorizedBlobUrl,
        type ComfyFolderType,
        uploadComfyImageFile,
    } from '$lib/svgen/comfyImageUrls';
    import SvGenAuthImg from './SvGenAuthImg.svelte';

    export let value: string;
    export let options: string[] = [];
    export let folderType: ComfyFolderType = 'input';

    const dispatch = createEventDispatcher<{ change: string }>();

    let open = false;
    let query = '';
    let status = '';
    let statusError = false;
    let previewBlobUrl: string | null = null;
    let previewPath = '';
    let previewToken = 0;
    let dropActive = false;
    let fileInput: HTMLInputElement;
    let overlayEl: HTMLDivElement | undefined;

    $: if (open && overlayEl && overlayEl.parentNode !== document.body)
        document.body.appendChild(overlayEl);

    onMount(() => {
        return () => {
            overlayEl?.remove();
        };
    });

    $: leaves = (options.length ? options : (value ? [value] : []))
        .map((raw) => {
            const v = String(raw);
            const parts = v.replace(/\\/g, '/').split('/').filter(Boolean);
            return { value: v, label: parts[parts.length - 1] || v };
        })
        .filter((leaf) => leaf.value);

    $: filtered = leaves
        .filter((leaf) => !query.trim()
            || leaf.label.toLowerCase().includes(query.trim().toLowerCase())
            || leaf.value.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.label.localeCompare(b.label));

    $: selectedLabel = leaves.find((l) => l.value === value)?.label ?? value;
    $: void refreshPreview(value, folderType);

    async function refreshPreview(raw: string, type: ComfyFolderType) {
        const path = buildComfyViewPath(raw, { folderType: type });
        if (path === previewPath && previewBlobUrl)
            return;

        previewPath = path;
        const token = ++previewToken;

        if (!path) {
            previewBlobUrl = null;
            return;
        }

        // Show cached frame immediately on remount / parent churn.
        const peeked = peekAuthorizedBlobUrl(path);
        if (peeked)
            previewBlobUrl = peeked;

        const next = await fetchAuthorizedBlobUrl(path);
        if (token !== previewToken || previewPath !== path)
            return;
        if (next)
            previewBlobUrl = next;
    }

    function openModal() {
        open = true;
        query = '';
        status = '';
        statusError = false;
    }

    function closeModal() {
        open = false;
        query = '';
        status = '';
        statusError = false;
        dropActive = false;
    }

    function pick(next: string) {
        dispatch('change', next);
        closeModal();
    }

    function setStatus(message: string, isError = false) {
        status = message;
        statusError = isError;
    }

    async function onFile(file: File) {
        try {
            setStatus('Uploading…');
            const path = await uploadComfyImageFile(file, folderType);
            if (!options.includes(path))
                options = [...options, path];
            invalidateAuthorizedBlobUrl(buildComfyViewPath(path, { folderType }));
            previewPath = '';
            dispatch('change', path);
            closeModal();
        } catch (err) {
            setStatus(err instanceof Error ? err.message : String(err), true);
        }
    }

    function onDrop(event: DragEvent) {
        event.preventDefault();
        dropActive = false;
        const file = event.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/'))
            void onFile(file);
    }

    function onPaste(event: ClipboardEvent) {
        const items = event.clipboardData?.items;
        if (!items)
            return;
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    event.preventDefault();
                    void onFile(file);
                }
                return;
            }
        }
    }

    function onKeydown(event: KeyboardEvent) {
        if (open && event.key === 'Escape') {
            event.preventDefault();
            closeModal();
        }
    }

    onDestroy(() => {
        // Blob URLs are owned by the shared cache — do not revoke on unmount.
        previewToken += 1;
    });
</script>

<svelte:window on:keydown={onKeydown} />

<div class="picker">
    <div
        class="preview"
        class:drop={dropActive}
        role="button"
        tabindex="0"
        title="Click to select image"
        on:click={openModal}
        on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openModal();
            }
        }}
        on:dragover|preventDefault={() => (dropActive = true)}
        on:dragleave={() => (dropActive = false)}
        on:drop={onDrop}
    >
        {#if previewBlobUrl}
            <img src={previewBlobUrl} alt="" draggable="false" />
        {:else}
            <span class="empty">{value ? 'Preview unavailable' : 'No image selected'}</span>
        {/if}
        <div class="caption" title={selectedLabel || ''}>
            {selectedLabel || 'Select image...'}
        </div>
    </div>
</div>

{#if open}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
        bind:this={overlayEl}
        class="overlay"
        role="presentation"
        on:pointerdown={(e) => {
            if (e.target === e.currentTarget)
                closeModal();
        }}
    >
        <div
            class="modal"
            class:drop={dropActive}
            role="dialog"
            aria-modal="true"
            aria-label="Select image"
            on:pointerdown|stopPropagation
            on:dragover|preventDefault={() => (dropActive = true)}
            on:dragleave={() => (dropActive = false)}
            on:drop={onDrop}
            on:paste={onPaste}
        >
            <div class="header">
                <div class="title">Select image</div>
                <div class="actions">
                    <button type="button" on:click={() => fileInput?.click()}>Upload</button>
                    <button type="button" on:click={closeModal}>Close</button>
                </div>
            </div>
            <div class="search-row">
                <input
                    type="search"
                    placeholder="Search images..."
                    bind:value={query}
                />
            </div>
            {#if status}
                <div class="status" class:error={statusError}>{status}</div>
            {/if}
            <div class="grid">
                {#if !filtered.length}
                    <div class="empty-grid">{query ? 'No matches.' : 'No images available.'}</div>
                {:else}
                    {#each filtered as leaf}
                        <button
                            type="button"
                            class="tile"
                            class:selected={leaf.value === value}
                            on:click={() => pick(leaf.value)}
                        >
                            <div class="thumb">
                                <SvGenAuthImg
                                    path={buildComfyViewPath(leaf.value, { folderType })}
                                    loading="lazy"
                                >
                                    <span slot="fallback" class="thumb-fallback">{leaf.label}</span>
                                </SvGenAuthImg>
                            </div>
                            <div class="tile-caption" title={leaf.label}>{leaf.label}</div>
                        </button>
                    {/each}
                {/if}
            </div>
            <input
                bind:this={fileInput}
                type="file"
                accept="image/*"
                hidden
                on:change={() => {
                    const file = fileInput.files?.[0];
                    if (file)
                        void onFile(file);
                    fileInput.value = '';
                }}
            />
        </div>
    </div>
{/if}

<style lang="scss">
    .picker {
        width: 100%;
        min-width: 0;
    }

    .preview {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 120px;
        max-height: 220px;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 10px;
        background-color: var(--bg-elev);
        background-image:
            linear-gradient(45deg, color-mix(in srgb, var(--ink) 4%, transparent) 25%, transparent 25%),
            linear-gradient(-45deg, color-mix(in srgb, var(--ink) 4%, transparent) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--ink) 4%, transparent) 75%),
            linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--ink) 4%, transparent) 75%);
        background-size: 16px 16px;
        background-position: 0 0, 0 8px, 8px -8px, -8px 0;
        cursor: pointer;

        &.drop {
            border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
        }

        img {
            display: block;
            max-width: 100%;
            max-height: 220px;
            object-fit: contain;
        }

        .empty {
            padding: 16px 16px 36px;
            color: var(--muted);
            font-size: 11px;
            font-style: italic;
            text-align: center;
        }
    }

    .caption {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 7px 9px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: color-mix(in srgb, var(--bg) 78%, transparent);
        color: var(--ink);
        font-size: 11px;
        font-weight: 600;
        pointer-events: none;
    }

    .overlay {
        position: fixed;
        inset: 0;
        z-index: 10050;
        display: grid;
        place-items: center;
        padding: 1rem;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(4px);
    }

    .modal {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: min(920px, calc(100vw - 2rem));
        height: min(780px, calc(100dvh - 2rem));
        max-height: calc(100vh - 2rem);
        padding: 12px;
        box-sizing: border-box;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--bg-elev);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);

        &.drop {
            border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
        }
    }

    .header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .title {
        flex: 1;
        font-weight: 700;
        font-size: 0.95rem;
    }

    .actions {
        display: flex;
        gap: 0.35rem;

        button {
            appearance: none;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--bg);
            color: var(--ink);
            font: inherit;
            font-size: 11px;
            padding: 0.3rem 0.55rem;
            cursor: pointer;
        }
    }

    .search-row input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--bg);
        color: var(--ink);
        font: inherit;
        font-size: 12px;
        padding: 7px 9px;
    }

    .status {
        font-size: 11px;
        color: var(--muted);

        &.error {
            color: #e88;
        }
    }

    .grid {
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        grid-auto-rows: max-content;
        gap: 8px;
        align-items: start;
    }

    .empty-grid {
        grid-column: 1 / -1;
        padding: 2rem;
        text-align: center;
        color: var(--muted);
        font-size: 12px;
    }

    .tile {
        display: block;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--bg);
        color: inherit;
        padding: 6px;
        overflow: hidden;
        cursor: pointer;
        text-align: left;

        &.selected {
            border-color: var(--accent);
            box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
        }
    }

    .thumb {
        position: relative;
        flex: 0 0 auto;
        width: 100%;
        aspect-ratio: 1 / 1;
        background: var(--bg-elev);
        border-radius: 4px;
        overflow: hidden;

        :global(img),
        :global(.thumb-fallback) {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            width: 100%;
            height: 100%;
            border: 0;
            object-fit: cover;
        }
    }

    .thumb-fallback {
        font-size: 10px;
        color: var(--muted);
        padding: 6px;
        text-align: center;
        word-break: break-all;
    }

    .tile-caption {
        padding: 5px 6px;
        font-size: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
