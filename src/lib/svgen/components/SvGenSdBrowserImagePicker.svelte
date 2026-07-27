<script lang="ts">
    import { onDestroy } from 'svelte';
    import { getImageInfo } from '$lib/requests/imageRequests';
    import {
        buildComfyViewPath,
        fetchAuthorizedBlobUrl,
        isLocalImageId,
        peekAuthorizedBlobUrl,
        sdBrowserImageUrl,
        stripLocalImageId,
    } from '$lib/svgen/comfyImageUrls';
    import {
        openSdBrowserPicker,
        type SdBrowserPickerImageWrite,
    } from '$lib/svgen/sdBrowserPickerStore';
    import {
        nodePreviewStoreKey,
        svgenNodePreviewsStore,
        svgenOpenSessionsStore,
    } from '$lib/svgen/stores';
    import type { NodePreviewEntry } from '$lib/svgen/nodePreviews';
    import type { SvgenCompanionWrite } from '$lib/svgen/types';

    export let value: string;
    export let searchValue = '';
    export let randomEnabled = false;
    export let searchCompanion: SvgenCompanionWrite | undefined = undefined;
    export let randomCompanion: SvgenCompanionWrite | undefined = undefined;
    export let imageWrite: SdBrowserPickerImageWrite;

    let previewBlobUrl: string | null = null;
    let previewPath = '';
    let previewToken = 0;
    let caption = 'Select image...';
    let captionTitle = '';
    let emptyText = 'No image selected';
    let dropActive = false;

    $: activeSessionId = $svgenOpenSessionsStore.activeId;
    $: lastExecutedPreview = (() => {
        if (!randomEnabled || !activeSessionId)
            return null;
        const byOuter = $svgenNodePreviewsStore.get(
            nodePreviewStoreKey(activeSessionId, imageWrite.nodeId),
        );
        if (byOuter)
            return byOuter;
        // Converter-expanded subgraphs execute as `outerId:innerId`.
        if (imageWrite.innerNodeId) {
            return $svgenNodePreviewsStore.get(
                nodePreviewStoreKey(
                    activeSessionId,
                    `${imageWrite.nodeId}:${imageWrite.innerNodeId}`,
                ),
            ) ?? null;
        }
        return null;
    })();

    $: void refreshPreview(value, randomEnabled, searchValue, lastExecutedPreview);

    function shortLabel(imageId: string, folder?: string) {
        if (folder)
            return folder;
        if (imageId.length <= 16)
            return imageId || 'Select image...';
        return `${imageId.slice(0, 8)}…${imageId.slice(-6)}`;
    }

    async function refreshPreview(
        raw: string,
        random: boolean,
        search: string,
        executed: NodePreviewEntry | null,
    ) {
        const token = ++previewToken;

        if (random) {
            const path = executed?.path ?? '';
            if (path) {
                caption = search.trim() || 'Random pick';
                captionTitle = search.trim()
                    ? `Random from: ${search}`
                    : 'Random mode — last executed pick';
                emptyText = '';

                if (path === previewPath && previewBlobUrl)
                    return;
                previewPath = path;

                const peeked = peekAuthorizedBlobUrl(path);
                if (peeked)
                    previewBlobUrl = peeked;

                const next = await fetchAuthorizedBlobUrl(path);
                if (token !== previewToken || previewPath !== path)
                    return;
                if (next) {
                    previewBlobUrl = next;
                    emptyText = '';
                } else if (!previewBlobUrl) {
                    emptyText = 'Preview unavailable';
                }
                return;
            }

            previewPath = '';
            previewBlobUrl = null;
            emptyText = search.trim() ? 'Random from search' : 'Random (all images)';
            caption = search.trim() || 'Random mode';
            captionTitle = search.trim()
                ? `Random from: ${search}`
                : 'Random mode — uses search results at execute time';
            return;
        }

        const imageId = String(raw || '').trim();
        if (!imageId) {
            previewPath = '';
            previewBlobUrl = null;
            emptyText = 'No image selected';
            caption = 'Select image...';
            captionTitle = '';
            return;
        }

        if (isLocalImageId(imageId)) {
            const path = buildComfyViewPath(stripLocalImageId(imageId), {
                folderType: 'input',
            });
            caption = shortLabel(stripLocalImageId(imageId));
            captionTitle = imageId;

            if (path === previewPath && previewBlobUrl) {
                emptyText = '';
                return;
            }
            previewPath = path;

            const peeked = peekAuthorizedBlobUrl(path);
            if (peeked)
                previewBlobUrl = peeked;

            const next = path ? await fetchAuthorizedBlobUrl(path) : null;
            if (token !== previewToken || previewPath !== path)
                return;
            if (next) {
                previewBlobUrl = next;
                emptyText = '';
            } else if (!previewBlobUrl) {
                emptyText = 'Preview unavailable';
            }
            return;
        }

        previewPath = `library:${imageId}`;
        previewBlobUrl = null;
        caption = shortLabel(imageId);
        captionTitle = imageId;
        emptyText = '';
        const info = await getImageInfo(imageId).catch(() => undefined);
        if (token !== previewToken || previewPath !== `library:${imageId}`)
            return;
        if (info?.folder) {
            caption = shortLabel(imageId, info.folder);
            captionTitle = `${info.folder} (${imageId})`;
        }
    }

    function openModal() {
        openSdBrowserPicker({
            value,
            searchValue,
            randomEnabled,
            imageWrite,
            searchCompanion,
            randomCompanion,
        });
    }

    onDestroy(() => {
        previewToken += 1;
    });
</script>

<div class="picker">
    <div
        class="preview"
        class:drop={dropActive}
        role="button"
        tabindex="0"
        title="Click to select image from sd-browser"
        on:click={openModal}
        on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openModal();
            }
        }}
        on:dragover|preventDefault={() => (dropActive = true)}
        on:dragleave={() => (dropActive = false)}
        on:drop|preventDefault={() => {
            dropActive = false;
            openModal();
        }}
    >
        {#if previewBlobUrl}
            <img src={previewBlobUrl} alt="" draggable="false" />
        {:else if !randomEnabled && value && !isLocalImageId(value)}
            <img
                src={sdBrowserImageUrl(value, { quality: 'low', defer: false, preview: true })}
                alt=""
                draggable="false"
            />
        {:else}
            <span class="empty">{emptyText}</span>
        {/if}
        <div class="caption" title={captionTitle}>{caption}</div>
    </div>
</div>

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
        border: none;
        border-radius: 8px;
        background-color: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        background-image:
            linear-gradient(45deg, color-mix(in srgb, var(--ink) 4%, transparent) 25%, transparent 25%),
            linear-gradient(-45deg, color-mix(in srgb, var(--ink) 4%, transparent) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--ink) 4%, transparent) 75%),
            linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--ink) 4%, transparent) 75%);
        background-size: 16px 16px;
        background-position: 0 0, 0 8px, 8px -8px, -8px 0;
        cursor: pointer;

        &.drop {
            box-shadow:
                inset 0 1px 3px rgba(0, 0, 0, 0.45),
                0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
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
            font-size: 0.78rem;
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
        font-size: 0.78rem;
        font-weight: 600;
        pointer-events: none;
    }
</style>
