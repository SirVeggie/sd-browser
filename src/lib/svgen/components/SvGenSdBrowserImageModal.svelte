<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import Select from '$lib/items/Select.svelte';
    import {
        fetchImagePage,
        subscribeImageStream,
    } from '$lib/requests/imageRequests';
    import {
        buildComfyViewPath,
        invalidateAuthorizedBlobUrl,
        sdBrowserImageUrl,
        toLocalImageId,
        uploadComfyImageFile,
    } from '$lib/svgen/comfyImageUrls';
    import {
        closeSdBrowserPicker,
        writeSdBrowserPickerImage,
        writeSdBrowserPickerSearch,
        type SdBrowserPickerSession,
    } from '$lib/svgen/sdBrowserPickerStore';
    import { hasMmrSearchParts, hasSimilaritySearchParts } from '$lib/tools/searchParsing';
    import {
        syncTemporarySorts,
        type TemporarySortState,
    } from '$lib/tools/similaritySort';
    import type { SortingMethod } from '$lib/types/misc';
    import { isSortingMethod, sortingMethods } from '$lib/types/misc';
    import type { ClientImage } from '$lib/types/images';

    export let session: SdBrowserPickerSession;

    const SORT_KEY = 'sv-generation-panel-sd-browser';
    const DEBOUNCE_MS = 150;

    let overlayEl: HTMLDivElement | undefined;
    let query = '';
    let sorting: SortingMethod = 'date';
    let temporaryState: TemporarySortState = {
        similarity: { active: false },
        uniqueness: { active: false },
    };
    let status = '';
    let statusError = false;
    let images: Omit<ClientImage, 'url'>[] = [];
    let sessionId = '';
    let totalAmount = 0;
    let loading = false;
    let loadingMore = false;
    let hasMore = false;
    let dropActive = false;
    let fileInput: HTMLInputElement;
    let gridEl: HTMLDivElement;
    let abort: AbortController | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    $: sortOptions = buildSortOptions(
        hasSimilaritySearchParts(query),
        hasMmrSearchParts(query),
    );

    onMount(() => {
        if (overlayEl)
            document.body.appendChild(overlayEl);

        temporaryState = { similarity: { active: false }, uniqueness: { active: false } };
        query = session.searchValue;
        sorting = loadPersistedSort();
        syncSortForSearch(query);
        status = '';
        statusError = false;
        void runSearch(false);

        return () => {
            overlayEl?.remove();
        };
    });

    onDestroy(() => {
        abort?.abort();
        clearTimeout(debounceTimer);
    });

    function buildSortOptions(hasSimilarity: boolean, hasUniqueness: boolean): SortingMethod[] {
        const next: SortingMethod[] = [...sortingMethods];
        if (hasSimilarity) {
            next.push('similar', 'similar (inverse)');
        }
        if (hasUniqueness)
            next.push('uniqueness');
        return next;
    }

    function loadPersistedSort(): SortingMethod {
        try {
            const raw = localStorage.getItem(SORT_KEY);
            if (!raw)
                return 'date';
            const parsed = JSON.parse(raw) as { sorting?: string };
            return isSortingMethod(parsed.sorting) ? parsed.sorting : 'date';
        } catch {
            return 'date';
        }
    }

    function persistSort(next: SortingMethod) {
        try {
            localStorage.setItem(SORT_KEY, JSON.stringify({ sorting: next }));
        } catch {
            /* ignore */
        }
    }

    function syncSortForSearch(search: string) {
        const hasSimilarity = hasSimilaritySearchParts(search);
        const hasUniqueness = hasMmrSearchParts(search);
        const result = syncTemporarySorts(sorting, temporaryState, {
            hasSimilarity,
            hasUniqueness,
        });
        temporaryState = result.state;
        sorting = result.sorting;
    }

    function setStatus(message: string, isError = false) {
        status = message;
        statusError = isError;
    }

    function scheduleSearch() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => void runSearch(false), DEBOUNCE_MS);
    }

    function filterImages(list: Omit<ClientImage, 'url'>[] | undefined) {
        return (list ?? []).filter((img) => !!img?.id && img.type !== 'video');
    }

    async function runSearch(append: boolean) {
        abort?.abort();
        abort = new AbortController();
        const signal = abort.signal;

        if (!append) {
            images = [];
            sessionId = '';
            totalAmount = 0;
            hasMore = false;
            loading = true;
            setStatus('Searching…');
        } else {
            loadingMore = true;
        }

        writeSdBrowserPickerSearch(query);
        syncSortForSearch(query);
        persistSort(
            sorting === 'similar' || sorting === 'similar (inverse)' || sorting === 'uniqueness'
                ? (temporaryState.similarity.savedSorting
                    ?? temporaryState.uniqueness.savedSorting
                    ?? 'date')
                : sorting,
        );

        try {
            await subscribeImageStream(
                {
                    search: query,
                    matching: 'regex',
                    sorting,
                    explorationMode: 'none',
                    sparseFrequency: 25,
                    similarityAlgorithm: 'token-jaccard',
                    similarityThreshold: 0.5,
                },
                {
                    onInit: (init) => {
                        sessionId = init.sessionId;
                    },
                    onChunk: (chunk) => {
                        const next = filterImages(chunk.images);
                        const seen = new Set(images.map((i) => i.id));
                        const unique = next.filter((img) => !seen.has(img.id));
                        if (unique.length)
                            images = [...images, ...unique];
                    },
                    onReady: (ready) => {
                        totalAmount = ready.amount ?? images.length;
                        hasMore = images.length < totalAmount;
                        const err = ready.imgSearchError
                            || ready.pruneSearchError
                            || ready.mmrSearchError;
                        if (err) {
                            setStatus(String(err), true);
                        } else {
                            setStatus(
                                totalAmount >= 0
                                    ? `${images.length} / ${totalAmount}`
                                    : `${images.length} images`,
                            );
                        }
                    },
                    onUpdate: () => {
                        /* ignore live gallery updates while picking */
                    },
                },
                signal,
            );
        } catch (err) {
            if (signal.aborted)
                return;
            setStatus(err instanceof Error ? err.message : String(err), true);
        } finally {
            if (!signal.aborted) {
                loading = false;
                loadingMore = false;
            }
        }
    }

    async function loadMore() {
        if (!hasMore || loadingMore || loading || !sessionId || !images.length)
            return;
        loadingMore = true;
        try {
            const page = await fetchImagePage({
                sessionId,
                latestId: '',
                oldestId: images[images.length - 1]?.id ?? '',
            });
            const next = filterImages(page.images);
            const seen = new Set(images.map((i) => i.id));
            const unique = next.filter((img) => !seen.has(img.id));
            if (unique.length)
                images = [...images, ...unique];
            if (typeof page.amount === 'number' && page.amount >= 0)
                totalAmount = page.amount;
            hasMore = images.length < totalAmount && unique.length > 0;
            setStatus(
                totalAmount >= 0
                    ? `${images.length} / ${totalAmount}`
                    : `${images.length} images`,
            );
        } catch (err) {
            setStatus(err instanceof Error ? err.message : String(err), true);
        } finally {
            loadingMore = false;
        }
    }

    function onGridScroll() {
        if (!gridEl)
            return;
        const remain = gridEl.scrollHeight - gridEl.scrollTop - gridEl.clientHeight;
        if (remain < 120)
            void loadMore();
    }

    function pick(imageId: string) {
        writeSdBrowserPickerImage(imageId);
        closeSdBrowserPicker();
    }

    async function onFile(file: File) {
        try {
            setStatus('Uploading…');
            const path = await uploadComfyImageFile(file, 'input');
            invalidateAuthorizedBlobUrl(buildComfyViewPath(path, { folderType: 'input' }));
            writeSdBrowserPickerImage(toLocalImageId(path));
            closeSdBrowserPicker();
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
        if (event.key === 'Escape') {
            event.preventDefault();
            closeSdBrowserPicker();
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- Portaled to document.body so flyout overflow cannot clip it; scoped styles still apply. -->
<div
    bind:this={overlayEl}
    class="overlay"
    role="presentation"
    on:pointerdown={(e) => {
        if (e.target === e.currentTarget)
            closeSdBrowserPicker();
    }}
>
    <div
        class="modal"
        class:drop={dropActive}
        role="dialog"
        aria-modal="true"
        aria-label="Select sd-browser image"
        on:pointerdown|stopPropagation
        on:dragover|preventDefault={() => (dropActive = true)}
        on:dragleave={() => (dropActive = false)}
        on:drop={onDrop}
        on:paste={onPaste}
    >
        <div class="header">
            <div class="title">SD Browser</div>
            <div class="actions">
                <div class="sort">
                    <Select
                        id="svgen-sd-browser-sort"
                        prefix="Sort"
                        bind:value={sorting}
                        options={sortOptions}
                        title="Sort"
                        on:change={() => void runSearch(false)}
                    />
                </div>
                <button type="button" on:click={() => fileInput?.click()}>Upload</button>
                <button type="button" on:click={closeSdBrowserPicker}>Close</button>
            </div>
        </div>
        <div class="search">
            <input
                type="search"
                placeholder="Search (sd-browser syntax)..."
                bind:value={query}
                on:input={() => {
                    syncSortForSearch(query);
                    scheduleSearch();
                }}
                on:keydown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        clearTimeout(debounceTimer);
                        void runSearch(false);
                    }
                }}
            />
        </div>
        {#if status}
            <div class="status" class:error={statusError}>{status}</div>
        {/if}
        <div class="grid" bind:this={gridEl} on:scroll={onGridScroll}>
            {#if !images.length && !loading}
                <div class="empty">No images.</div>
            {:else}
                {#each images as image (image.id)}
                    <button
                        type="button"
                        class="tile"
                        class:selected={image.id === session.value}
                        title={image.id}
                        on:click={() => pick(image.id)}
                    >
                        <div class="thumb" aria-hidden="true">
                            <img
                                src={sdBrowserImageUrl(image.id, {
                                    quality: 'low',
                                    defer: false,
                                    preview: true,
                                })}
                                alt=""
                                loading="lazy"
                                draggable="false"
                            />
                        </div>
                    </button>
                {/each}
            {/if}
            {#if loading || loadingMore}
                <div class="empty">{loadingMore ? 'Loading more…' : 'Searching…'}</div>
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

<style lang="scss">
    .overlay {
        position: fixed;
        inset: 0;
        z-index: 10050;
        display: grid;
        place-items: center;
        padding: 1rem;
        box-sizing: border-box;
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
        color: var(--ink);
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
        align-items: center;

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

    .sort {
        :global(.trigger) {
            box-sizing: border-box;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--bg);
            color: var(--ink);
            font-size: 11px;
            padding: 0.3rem 0.55rem;
            gap: 0.3rem;
        }

        :global(.trigger:focus-visible) {
            border-radius: 8px;
            background: color-mix(in srgb, var(--bg) 70%, #fff);
        }

        :global(.prefix) {
            color: var(--muted);
            font-style: normal;
        }

        :global(.chevron) {
            margin-left: 0.25em;
        }

        :global(.panel) {
            z-index: 10060;
            font-size: 12px;
        }
    }

    .search input {
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

    .empty {
        grid-column: 1 / -1;
        padding: 1.5rem;
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
        padding: 0;
        margin: 0;
        overflow: hidden;
        cursor: pointer;
        text-align: left;
        font: inherit;
        line-height: 0;

        &.selected {
            border-color: var(--accent);
            box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
        }
    }

    .thumb {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        background: #080b12;

        img {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            display: block;
            border: 0;
        }
    }
</style>
