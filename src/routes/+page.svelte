<script lang="ts">
    import NavArrows from "$lib/components/NavArrows.svelte";
    import { notify } from "$lib/components/Notifier.svelte";
    import Button from "$lib/items/Button.svelte";
    import ImageDisplay from "$lib/items/ImageDisplay.svelte";
    import ImageFull from "$lib/items/ImageFull.svelte";
    import Link from "$lib/items/Link.svelte";
    import SearchInput from "$lib/items/SearchInput.svelte";
    import Select from "$lib/items/Select.svelte";
    import { imageAmountStore, imageStore } from "$lib/stores/imageStore";
    import {
        generateCompressedImages,
        getImageInfo,
        imageAction,
        searchImages,
        subscribeImageStream,
    } from "$lib/requests/imageRequests";
    import { expandClientImages, formatSearchDateMinute } from "$lib/tools/misc";
    import {
        explorationModes,
        sortingMethods,
        type InputEvent,
        type SortingMethod,
    } from "$lib/types/misc";
    import { afterUpdate, onMount, tick } from "svelte";
    import { fade } from "svelte/transition";
    import {
        nsfwMode,
        showNsfwFilter,
        searchFilter,
        explorationMode,
        compressedMode,
        slideDelay,
        initialImages,
        buildSearchParams,
        syncSearchInput,
        type SearchParams,
    } from "$lib/stores/searchStore";
    import { imageFlow, imageSize, imageSpacing } from "$lib/stores/styleStore";
    import {
        closeAllContextMenus,
        type ContextMenuOption,
        openContextMenu,
    } from "$lib/items/ContextMenuManager.svelte";
    import { createSelection } from "$lib/tools/selectManager";
    import { askConfirmation } from "$lib/components/Confirm.svelte";
    import { sleep } from "$lib/tools/sleep";
    import {
        AUTO_LOAD_DEBOUNCE_MS,
        INITIAL_LOAD_THROTTLE_MS,
        isNearBottom,
    } from "$lib/tools/scrollLoadMore";
    import {
        AUTOLOAD_SUPPRESS_AFTER_LAYOUT_MS,
        getGridMetrics,
        MasonryPlacer,
        RESIZE_DEBOUNCE_IMAGE_THRESHOLD,
        RESIZE_LAYOUT_DEBOUNCE_MS,
        type MasonryColumn,
    } from "$lib/tools/masonryLayout";
    import {
        captureScrollAnchor,
        restoreScrollAnchor,
        type ScrollAnchor,
    } from "$lib/tools/scrollAnchor";
    import type { ClientImage, ImageInfo } from "$lib/types/images";
    import type { UpdateResponse } from "$lib/types/requests";
    import { fetchFolderPaths } from "$lib/requests/miscRequests";
    import { fetchImageTags, updateImageTags } from "$lib/requests/tagRequests";
    import { tagsStore } from "$lib/stores/tagsStore";
    import { tagsNotOnImage } from "$lib/types/tags";
    import { flyoutState } from "$lib/stores/flyoutStore";
    import BulkModal from "$lib/components/BulkModal.svelte";
    import FilterMultiSelect from "$lib/components/FilterMultiSelect.svelte";

    type ActionMode = "manual" | "auto";

    const initialAmount = Math.max($initialImages, 1);
    const increment = Math.max(initialAmount, 25);
    let currentAmount = initialAmount;
    let currentImage: ClientImage | undefined = undefined;
    let inputElement: HTMLInputElement;
    let inputTimer: any;
    let info: ImageInfo | undefined = undefined;
    let slideTimer: any;
    let slideDir: "left" | "right" = "right";
    let streamAbort: AbortController | undefined;
    let updateSessionId = 0;
    let searchSessionId = "";
    let live = false;
    let sorting: SortingMethod = "date";
    let triggerOverride = false;
    let updateTime = 0;
    let selecting = false;
    let bulkOpen = false;
    let bulkSearchParams: SearchParams = buildSearchParams();
    let searchCountComplete = false;
    const selection = createSelection();
    let anchorElement: HTMLDivElement;
    let scrollSessionStart = Date.now();
    let scrollLoadSession = 0;
    let lastAutoLoadTime = 0;
    let scrollRaf: number | undefined;
    const loadedImageIds = new Set<string>();
    const masonryPlacer = new MasonryPlacer();
    let gridElement: HTMLDivElement | undefined;
    let masonryColumns: MasonryColumn[] = [];
    let masonryRaf: number | undefined;
    let gridResizeObserver: ResizeObserver | undefined;
    let observedGrid: HTMLDivElement | undefined;
    let observedGridWidth = 0;
    let lastColumnCount = 0;
    let resizeDebounceTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeAnchor: ScrollAnchor | null = null;
    let gridResizing = false;
    let gridRevealing = false;
    let gridRevealVisible = false;
    let gridRevealTimer: ReturnType<typeof setTimeout> | undefined;
    const GRID_REVEAL_MS = 180;
    let resizePreserveHeight = 0;
    let resizeFrozenColumns = 0;
    let suppressAutoLoadUntil = 0;

    $: paginated = $imageStore.slice(0, currentAmount);
    $: prevIndex = !currentImage
        ? -1
        : paginated.findIndex((img) => img.id === currentImage?.id) - 1;
    $: nextIndex = !currentImage
        ? -1
        : paginated.findIndex((img) => img.id === currentImage?.id) + 1;
    $: rightArrow = live || (nextIndex >= 0 && nextIndex < paginated.length);
    $: leftArrow = (rightArrow || nextIndex == paginated.length) && !live;
    $: newestImage = paginated[0];
    $: spacingCompact = $imageSpacing === "compact";
    $: spacingMosaic = $imageSpacing === "mosaic";
    $: selection.setObjects(paginated.map((x) => x.id));
    $: slideshowInterval = Math.max($slideDelay, 100);
    $: masonryEnabled = $imageFlow === "masonry";
    $: gridStyle = buildGridStyle(
        $imageSize,
        gridResizing,
        resizePreserveHeight,
        resizeFrozenColumns,
        masonryEnabled,
    );

    $: if (!masonryEnabled) {
        masonryPlacer.reset("");
        masonryColumns = [];
    }

    $: if (masonryEnabled && gridElement) {
        paginated;
        searchSessionId;
        $imageSize;
        $imageSpacing;
        scheduleMasonryDataLayout();
    }

    $: if (gridElement && !masonryEnabled) {
        $imageSize;
        $imageSpacing;
        void applyGridSettingsLayout();
    }

    function scheduleMasonryDataLayout() {
        if (masonryRaf !== undefined) cancelAnimationFrame(masonryRaf);
        masonryRaf = requestAnimationFrame(() => {
            masonryRaf = undefined;
            void updateMasonryLayout();
        });
    }

    function suppressAutoLoadBriefly() {
        suppressAutoLoadUntil =
            Date.now() + AUTOLOAD_SUPPRESS_AFTER_LAYOUT_MS;
        lastAutoLoadTime = Date.now();
    }

    async function restoreScrollAfterLayout(anchor: ScrollAnchor | null) {
        if (!anchor) return;
        restoreScrollAnchor(anchor);
        await tick();
        requestAnimationFrame(() => {
            restoreScrollAnchor(anchor);
        });
    }

    async function updateMasonryLayout() {
        if (!masonryEnabled || !gridElement) return;
        await tick();
        await applyColumnCountChange(getGridMetrics(gridElement), true);
    }

    async function applyGridSettingsLayout() {
        if (!gridElement || masonryEnabled) return;
        await tick();
        await applyColumnCountChange(getGridMetrics(gridElement), false);
    }

    async function applyColumnCountChange(
        metrics: ReturnType<typeof getGridMetrics>,
        masonryReflow: boolean,
    ) {
        if (!gridElement) return;

        const columnCountChanged =
            lastColumnCount !== 0 &&
            metrics.columnCount !== lastColumnCount;

        if (lastColumnCount === 0) {
            if (masonryReflow) {
                masonryColumns = masonryPlacer.layout(
                    paginated,
                    searchSessionId,
                    metrics,
                );
            }
            lastColumnCount = metrics.columnCount;
            return;
        }

        if (!columnCountChanged) {
            if (masonryReflow) {
                masonryColumns = masonryPlacer.layout(
                    paginated,
                    searchSessionId,
                    metrics,
                );
            }
            return;
        }

        const anchor = captureScrollAnchor(gridElement);
        suppressAutoLoadBriefly();

        if (masonryReflow) {
            masonryColumns = masonryPlacer.layout(
                paginated,
                searchSessionId,
                metrics,
            );
            await tick();
        }

        await restoreScrollAfterLayout(anchor);
        lastColumnCount = metrics.columnCount;
    }

    function buildGridStyle(
        imageSize: string,
        resizing: boolean,
        preserveHeight: number,
        frozenColumns: number,
        masonry: boolean,
    ) {
        const parts = [`--size-offset:${parseSizeOffset(imageSize)}`];
        if (resizing && preserveHeight > 0) {
            parts.push(`min-height:${preserveHeight}px`);
        }
        if (resizing && !masonry && frozenColumns > 0) {
            parts.push(`--resize-columns:${frozenColumns}`);
        }
        return parts.join(";");
    }

    function clearGridReveal() {
        if (gridRevealTimer !== undefined) {
            clearTimeout(gridRevealTimer);
            gridRevealTimer = undefined;
        }
        gridRevealing = false;
        gridRevealVisible = false;
    }

    function startGridReveal() {
        clearGridReveal();
        gridRevealing = true;
        gridRevealVisible = false;

        void tick().then(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    gridRevealVisible = true;
                    gridRevealTimer = setTimeout(() => {
                        gridRevealTimer = undefined;
                        gridRevealing = false;
                        gridRevealVisible = false;
                    }, GRID_REVEAL_MS);
                });
            });
        });
    }

    function beginGridResize() {
        if (!gridElement || gridResizing) return;

        clearGridReveal();
        resizeAnchor = captureScrollAnchor(gridElement);
        resizePreserveHeight = gridElement.offsetHeight;
        resizeFrozenColumns =
            lastColumnCount || getGridMetrics(gridElement).columnCount;
        gridResizing = true;
    }

    function handleGridResize() {
        if (!gridElement) return;
        beginGridResize();

        const debounceMs =
            paginated.length <= RESIZE_DEBOUNCE_IMAGE_THRESHOLD
                ? 80
                : RESIZE_LAYOUT_DEBOUNCE_MS;

        if (resizeDebounceTimer !== undefined) {
            clearTimeout(resizeDebounceTimer);
        }
        resizeDebounceTimer = setTimeout(() => {
            resizeDebounceTimer = undefined;
            void finishGridResize();
        }, debounceMs);
    }

    async function finishGridResize() {
        if (!gridElement) return;

        const metrics = getGridMetrics(gridElement);
        const newColumnCount = metrics.columnCount;
        const anchor = resizeAnchor;
        const columnCountChanged =
            lastColumnCount !== 0 && newColumnCount !== lastColumnCount;

        suppressAutoLoadBriefly();

        if (masonryEnabled && columnCountChanged) {
            masonryColumns = masonryPlacer.layout(
                paginated,
                searchSessionId,
                metrics,
            );
            await tick();
        }

        gridResizing = false;
        resizePreserveHeight = 0;
        resizeFrozenColumns = 0;
        resizeAnchor = null;

        await tick();
        await restoreScrollAfterLayout(anchor);
        lastColumnCount = newColumnCount;
        startGridReveal();
    }

    function syncInitialColumnCount() {
        if (!gridElement || lastColumnCount !== 0) return;
        lastColumnCount = getGridMetrics(gridElement).columnCount;
    }

    onMount(() => {
        scrollToTop();
        reconnectSearch();
        fetchFolderPaths().catch(() => {});

        window.addEventListener("keydown", keylistener);
        window.addEventListener("scroll", onScroll, { passive: true });

        gridResizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;

            const width = entry.contentRect.width;
            if (observedGridWidth === 0) {
                observedGridWidth = width;
                return;
            }
            if (Math.abs(width - observedGridWidth) < 0.5) return;

            observedGridWidth = width;
            handleGridResize();
        });

        return () => {
            clearTimeout(inputTimer);
            if (resizeDebounceTimer !== undefined) {
                clearTimeout(resizeDebounceTimer);
            }
            clearGridReveal();
            updateSessionId++;
            streamAbort?.abort();
            streamAbort = undefined;
            clearInterval(slideTimer);
            closeImage();
            window.removeEventListener("keydown", keylistener);
            window.removeEventListener("scroll", onScroll);
            if (scrollRaf !== undefined) cancelAnimationFrame(scrollRaf);
            if (masonryRaf !== undefined) cancelAnimationFrame(masonryRaf);
            gridResizeObserver?.disconnect();
        };
    });

    afterUpdate(() => {
        if (!gridElement || !gridResizeObserver) return;
        if (gridElement === observedGrid) return;
        if (observedGrid) gridResizeObserver.unobserve(observedGrid);
        gridResizeObserver.observe(gridElement);
        observedGrid = gridElement;
        observedGridWidth = gridElement.getBoundingClientRect().width;
        syncInitialColumnCount();
    });

    function parseSizeOffset(str: string) {
        if (!str) return "0px";
        if (/^-?\d+$/.test(str)) return `${str}px`;
        return str;
    }

    function openImage(img: ClientImage, e?: MouseEvent | KeyboardEvent) {
        // do nothing if not left click
        if (e && e instanceof MouseEvent && e.button !== 0) return;
        currentImage = img;
        getImageInfo(img.id).then((res) => {
            info = res;
        });

        if ($compressedMode === "medium") {
            const currentImages = $imageStore;
            const startIndex = Math.max(
                0,
                currentImages.findIndex((img) => img.id === currentImage?.id) -
                    10,
            );
            const endIndex = Math.min(currentImages.length, startIndex + 50);
            setTimeout(() => {
                console.log(
                    `Generating compressed images ${startIndex} - ${endIndex}`,
                );
                generateCompressedImages(
                    currentImages.map((x) => x.id).slice(startIndex, endIndex),
                );
            }, 1000);
        }
    }

    function closeImage() {
        currentImage = undefined;
        info = undefined;
        live = false;
        if (slideTimer) {
            clearInterval(slideTimer);
            slideTimer = undefined;
            notify("Slideshow stopped");
        }
    }

    function openLive() {
        if (live) return;
        if (paginated.length === 0) return;
        if (currentImage) closeImage();
        live = true;
    }

    function goLeft(mode?: ActionMode) {
        if (leftArrow && prevIndex < 0) {
            if (!mode || typeof mode !== "string" || mode === "manual") {
                openLive();
            } else {
                return false;
            }
        } else if (leftArrow) {
            currentImage = paginated[prevIndex];
            scrollToImage();
            getImageInfo(currentImage!.id).then((res) => {
                info = res;
            });

            if (slideTimer && slideDir === "right") {
                startSlideshow("left", false);
                notify("Sliding left", undefined, "dir");
            }
        }

        return true;
    }

    function goRight() {
        if (live) {
            closeImage();
            openImage(paginated[0]);
        } else if (rightArrow) {
            currentImage = paginated[nextIndex];
            if (nextIndex == paginated.length - 1) {
                loadMore();
            }
            scrollToImage();
            getImageInfo(currentImage!.id).then((res) => {
                info = res;
            });

            if (slideTimer && slideDir === "left") {
                startSlideshow("right", false);
                notify("Sliding right", undefined, "dir");
            }
        }
    }

    function scrollToImage() {
        if (!currentImage) return;
        const el = document.getElementById(`img_${currentImage.id}`);
        if (el) {
            el.scrollIntoView({ behavior: "auto", block: "center" });
        }
    }

    function scrollToTop() {
        anchorElement.scrollIntoView();
    }

    function applySearchViewReset() {
        scrollToTop();
        currentAmount = initialAmount;
        resetScrollLoadSession();
        lastColumnCount = 0;
    }

    function resetScrollLoadSession() {
        scrollSessionStart = Date.now();
        lastAutoLoadTime = 0;
        loadedImageIds.clear();
        scrollLoadSession++;
    }

    function onScroll() {
        if (scrollRaf !== undefined) return;
        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = undefined;
            maybeAutoLoadMore();
        });
    }

    function allVisibleImagesLoaded() {
        return paginated.every((img) => loadedImageIds.has(img.id));
    }

    function hasMoreImagesToLoad() {
        return (
            currentAmount < $imageStore.length ||
            currentAmount < $imageAmountStore
        );
    }

    function canAutoLoadMore() {
        if (Date.now() < suppressAutoLoadUntil) return false;
        if (!hasMoreImagesToLoad()) return false;
        if (Date.now() - lastAutoLoadTime < AUTO_LOAD_DEBOUNCE_MS) return false;

        const inInitialPeriod =
            Date.now() - scrollSessionStart < INITIAL_LOAD_THROTTLE_MS;
        if (inInitialPeriod && !allVisibleImagesLoaded()) return false;

        return true;
    }

    function maybeAutoLoadMore() {
        if (!canAutoLoadMore() || !isNearBottom()) return;
        lastAutoLoadTime = Date.now();
        loadMore();
    }

    function handleImageLoaded(id: string) {
        loadedImageIds.add(id);
        maybeAutoLoadMore();
    }

    function inputChange() {
        applyInput();
    }

    function applyInput() {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            reconnectSearch();
        }, 100);
    }

    function selectChange(_reset?: boolean) {
        reconnectSearch();
    }

    function reconnectSearch() {
        streamAbort?.abort();
        streamAbort = undefined;
        searchSessionId = "";
        const sessionId = ++updateSessionId;
        connectImageStream(sessionId);
    }

    function connectImageStream(expectedSessionId: number) {
        const abort = new AbortController();
        streamAbort = abort;
        const search = buildSearchParams();
        let hasReceivedImages = false;

        subscribeImageStream(
            {
                ...search,
                sorting,
            },
            {
                onInit: (init) => {
                    if (expectedSessionId !== updateSessionId) return;
                    searchSessionId = init.sessionId;
                    searchCountComplete = false;
                    updateTime = init.timestamp;
                },
                onChunk: (chunk) => {
                    if (expectedSessionId !== updateSessionId) return;
                    imageAmountStore.set(chunk.matched);
                    const mapped = expandClientImages(chunk.images);
                    if (!mapped.length) return;

                    if (!hasReceivedImages) {
                        hasReceivedImages = true;
                        applySearchViewReset();
                        imageStore.set(mapped);
                        return;
                    }

                    imageStore.update((x) => x.concat(mapped));
                },
                onReady: (ready) => {
                    if (expectedSessionId !== updateSessionId) return;
                    imageAmountStore.set(ready.amount);
                    searchCountComplete = true;
                    if (!hasReceivedImages && ready.amount === 0) {
                        applySearchViewReset();
                        imageStore.set([]);
                    }
                },
                onUpdate: (res) => applyUpdate(res, expectedSessionId),
            },
            abort.signal,
        ).catch((err) => {
            if (abort.signal.aborted || expectedSessionId !== updateSessionId) return;
            console.error(err);
            setTimeout(() => {
                if (abort.signal.aborted || expectedSessionId !== updateSessionId) return;
                connectImageStream(expectedSessionId);
            }, 2000);
        });
    }

    async function fetchNext() {
        const search = buildSearchParams();
        if ($imageStore.length === 0) return;
        const lastImage = $imageStore[$imageStore.length - 1];

        triggerOverride = true;

        try {
            const images = await searchImages({
                ...search,
                sorting,
                latestId: "",
                oldestId: lastImage.id,
                sessionId: searchSessionId || undefined,
            });

            if (images.amount <= 0) return;
            // TODO: is this check even useful?
            if ($imageStore.some((x) => x.id === images.images[0].id)) {
                console.log("Duplicate image found");
                return;
            }

            const mapped = expandClientImages(images.images);
            imageStore.update((x) => x.concat(mapped));
            imageAmountStore.set(images.amount);
        } catch (e: any) {
            console.error(e);
        } finally {
            triggerOverride = false;
        }
    }

    function applyUpdate(res: UpdateResponse, expectedSessionId: number) {
        if (expectedSessionId !== updateSessionId) return;
        if ($imageStore.length === 0) return;
        if (res.timestamp === -1) return;

        updateTime = res.timestamp;

        if (!res.additions.length) {
            if (!res.deletions.length) return;
            const nothingToDelete = !res.deletions.some((x) =>
                $imageStore.some((z) => z.id === x),
            );
            if (nothingToDelete) return;
        }

        const additions = res.additions.filter(
            (x) => !$imageStore.some((z) => z.id === x.id),
        );

        const mapped = expandClientImages(additions);
        let deletions = 0;

        imageStore.update((x) => {
            const modified = x.filter(
                (z) => res.deletions.indexOf(z.id) === -1,
            );
            deletions = x.length - modified.length;
            return mapped.concat(modified);
        });

        imageAmountStore.set(
            $imageAmountStore + additions.length - deletions,
        );
    }

    function loadMore() {
        const max = $imageStore.length;

        if (
            currentAmount >= max - increment * 4 &&
            currentAmount < $imageAmountStore
        ) {
            fetchNext();
        }

        currentAmount = Math.min(max, currentAmount + increment);
        scheduleAutoLoadCheck();
    }

    async function scheduleAutoLoadCheck() {
        await tick();
        requestAnimationFrame(() => maybeAutoLoadMore());
    }

    function slideshowLoop(dir: string) {
        if (dir === "right") {
            goRight();
        } else {
            const success = goLeft("auto");

            if (!success) {
                clearInterval(slideTimer);
                slideTimer = setInterval(slideshowWait, 100);
            }
        }
    }

    function slideshowWait() {
        if (prevIndex >= 0) {
            clearInterval(slideTimer);
            slideTimer = setInterval(slideshowLoop, slideshowInterval);
            goLeft("auto");
        }
    }

    function startSlideshow(dir: "left" | "right" = "right", ui = true) {
        if (slideTimer) stopSlideshow(false);
        slideDir = dir;
        slideTimer = setInterval(() => slideshowLoop(dir), slideshowInterval);
        if (ui) notify("Slideshow started");
    }

    function stopSlideshow(ui = true) {
        if (slideTimer) {
            clearInterval(slideTimer);
            slideTimer = undefined;
            if (ui) notify("Slideshow stopped");
        }
    }

    function keylistener(e: KeyboardEvent) {
        if (e.key === "ArrowLeft") {
            goLeft();
        } else if (e.key === "ArrowRight") {
            goRight();
        } else if (e.key === " ") {
            if (!currentImage) return;
            e.preventDefault();
            if (slideTimer) {
                clearInterval(slideTimer);
                slideTimer = undefined;
                notify("Slideshow stopped");
            } else {
                startSlideshow();
            }
        } else if (e.key === "f") {
            const active = document.activeElement;
            if (active?.tagName !== "INPUT") {
                flyoutState.set(!$flyoutState);
            }
        }
    }

    function handleEsc(e: KeyboardEvent) {
        if (e.key === "Escape" && selecting) {
            selection.deselectAll();
            selecting = false;
        }
    }

    function handleImgContext(id: string) {
        return async (e: InputEvent) => {
            const pos = getEventCoords(e);
            closeAllContextMenus();
            openContextMenu(pos, [
                {
                    name: "Select",
                    visible: !selecting,
                    handler() {
                        selection.select(id);
                        selecting = true;
                    },
                },
                {
                    name: "Cancel selection",
                    visible: selecting,
                    handler: cancelSelect,
                },
                {
                    name: "Select row",
                    visible: selecting,
                    handler() {
                        selection.selectRow(id);
                        if ($selection.length === 0) selecting = false;
                    },
                },
                {
                    name: "Open folder",
                    visible: !selecting,
                    handler: () => openFolder(id),
                },
                {
                    name: "Show similar",
                    visible: !selecting,
                    handler() {
                        explorationMode.set('none');
                        searchFilter.set(`SIMILAR ${id}`);
                        selectChange(true);
                    },
                },
                {
                    name: "Jump to",
                    visible: !selecting,
                    async handler() {
                        const imageInfo = await getImageInfo(id);
                        if (!imageInfo) return;
                        sorting = 'date';
                        searchFilter.set(`DT TO ${formatSearchDateMinute(imageInfo.modifiedDate)}`);
                        selectChange(true);
                    },
                },
                {
                    name: "Tag as...",
                    visible: !selecting && $tagsStore.tags.length > 0,
                    submenu: true,
                    handler: () => tagActionMenu(id),
                },
                {
                    name: "Move",
                    submenu: true,
                    handler: () => folderActionMenu(id, "move"),
                },
                {
                    name: "Copy",
                    submenu: true,
                    handler: () => folderActionMenu(id, "copy"),
                },
                {
                    name: "Delete",
                    visible: !selecting,
                    handler: () => deleteImg(id),
                },
                {
                    name: "Delete selected",
                    visible: selecting,
                    handler: deleteSelected,
                },
            ]);
        };
    }
    
    function handleSelectionButton(type: "move" | "copy") {
        return async (e: InputEvent) => {
            const pos = getEventCoords(e);
            closeAllContextMenus();
            const options = await folderActionMenu("", type);
            openContextMenu(pos, options);
        };
    }

    async function folderActionMenu(
        id: string,
        type: "move" | "copy",
    ): Promise<ContextMenuOption[]> {
        const list = await fetchFolderPaths();
        return list.map((folder) => ({
            name: folder,
            handler: () =>
                imageAction(selecting ? $selection : id, {
                    type,
                    folder,
                }),
        }));
    }

    async function tagActionMenu(id: string): Promise<ContextMenuOption[] | void> {
        try {
            const imageTags = await fetchImageTags(id);
            const available = tagsNotOnImage($tagsStore, imageTags);
            if (!available.length) {
                return [
                    {
                        name: "All tags on image",
                        enabled: false,
                        handler: () => {},
                    },
                ];
            }

            return available.map((tag) => ({
                name: tag,
                handler: async () => {
                    const current = await fetchImageTags(id);
                    if (current.includes(tag))
                        return;
                    await updateImageTags(id, [...current, tag]);
                },
            }));
        } catch (cause) {
            console.error(cause);
            notify(cause instanceof Error ? cause.message : "Failed to load tags", "warn");
        }
    }

    function getEventCoords(e: InputEvent) {
        if (e instanceof MouseEvent) {
            return {
                x: e.clientX,
                y: e.clientY,
            };
        }
        if (e instanceof TouchEvent) {
            return {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
            };
        }

        const rect = (e.target as Element)?.getBoundingClientRect();
        if (rect) {
            return {
                x: rect.left,
                y: rect.top,
            };
        }

        return {
            x: 0,
            y: 0,
        };
    }

    function selectImg(id: string) {
        return (e: MouseEvent) => {
            if (selecting) {
                e.preventDefault();

                if (e.shiftKey) {
                    selection.selectRow(id);
                } else {
                    selection.select(id);
                }

                if ($selection.length === 0) selecting = false;
            }
        };
    }
    
    function fillSelected() {
        selection.fillSelection();
    }

    async function deleteImg(id: string) {
        if (!id) return;
        if (await askConfirmation("Delete image")) {
            imageAction(id, { type: "delete" });
            removeImagesFromUI([id]);
        }
    }

    async function deleteSelected() {
        await sleep(25);
        if ($selection.length === 0)
            return notify("No images selected", "warn");
        if (
            await askConfirmation(
                "Delete images",
                `Delete ${$selection.length} images?`,
            )
        ) {
            imageAction($selection, { type: "delete" });
            removeImagesFromUI($selection);
        }
    }

    function removeImagesFromUI(ids: string[]) {
        let change = 0;
        let current = 0;
        imageStore.update((x) => {
            const initial = x.length;
            x = x.filter((z) => !ids.includes(z.id));
            current = x.length;
            change = initial - current;
            return x;
        });
        imageAmountStore.update((x) => x - change);
        currentAmount = Math.min(current, currentAmount);
        cancelSelect();
    }

    function cancelSelect() {
        selecting = false;
        selection.deselectAll();
    }

    function openFolder(id: string) {
        imageAction(id, { type: "open" });
    }

    function openBulk() {
        syncSearchInput(inputElement);
        bulkSearchParams = buildSearchParams(inputElement?.value);
        bulkOpen = true;
    }

    function handleBulkComplete(refresh?: boolean) {
        if (refresh) {
            reconnectSearch();
        }
    }
</script>

<svelte:window on:keydown={handleEsc} />

<div class="anchor" bind:this={anchorElement} />
<div class="topbar">
    <div class="quickbar">
        <span class="image-count">
            Images: {paginated.length} /
            <span class:pending={!searchCountComplete}>{$imageAmountStore}</span>
        </span>

        <Select
            id="sorting"
            prefix="Sorting"
            bind:value={sorting}
            options={sortingMethods}
            on:change={() => selectChange(true)}
        />

        <Select
            id="collapse"
            prefix="Collapse"
            bind:value={$explorationMode}
            options={explorationModes}
            on:change={() => selectChange(true)}
        />

        <FilterMultiSelect onChange={() => selectChange(false)} />

        {#if $showNsfwFilter}
            <label for="nsfw">
                NSFW:
                <input
                    type="checkbox"
                    id="nsfw"
                    bind:checked={$nsfwMode}
                    on:change={() => selectChange(false)}
                />
            </label>
        {/if}
    </div>

    {#if !selecting}
        <div class="nav">
            <SearchInput
                bind:element={inputElement}
                bind:value={$searchFilter}
                placeholder="Search"
                on:input={inputChange}
            />
            <Button on:click={() => (selecting = true)}>Select</Button>
            <Button on:click={openLive}>Live</Button>
            <Button on:click={openBulk}>Bulk</Button>
            <Link to="/settings">Settings</Link>
        </div>
    {:else}
        <div class="nav">
            <Button on:click={deleteSelected}>Delete</Button>
            <Button on:click={handleSelectionButton("move")}>Move</Button>
            <Button on:click={handleSelectionButton("copy")}>Copy</Button>
            <Button on:click={fillSelected}>Fill</Button>
            <div class="flexspacer" />
            <Button on:click={cancelSelect}>Cancel</Button>
        </div>
    {/if}
</div>

<div
    class="grid"
    class:spacing-compact={spacingCompact}
    class:spacing-mosaic={spacingMosaic}
    class:masonry={masonryEnabled}
    class:resizing={gridResizing}
    class:revealing={gridRevealing}
    class:reveal-visible={gridRevealVisible}
    style={gridStyle}
    bind:this={gridElement}
>
    <div class="masonry-probe" aria-hidden="true"></div>
    <div class="resize-overlay" aria-hidden="true" class:visible={gridResizing}>
        <p>Adjusting layout…</p>
    </div>
    <div class="grid-content">
        {#if masonryEnabled}
            {#each masonryColumns as column (column.key)}
                <div class="masonry-column">
                    {#each column.items as img (img.id)}
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <div
                            id={`img_${img.id}`}
                            class:selecting
                            on:click={selectImg(img.id)}
                        >
                            <ImageDisplay
                                {img}
                                loadSession={scrollLoadSession}
                                unselect={selecting &&
                                    !$selection.includes(img.id)}
                                onClick={!selecting && ((e) => openImage(img, e))}
                                onContext={handleImgContext(img.id)}
                                onLoaded={() => handleImageLoaded(img.id)}
                            />
                        </div>
                    {/each}
                </div>
            {/each}
        {:else}
            {#each paginated as img (img.id)}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <div id={`img_${img.id}`} class:selecting on:click={selectImg(img.id)}>
                    <ImageDisplay
                        {img}
                        loadSession={scrollLoadSession}
                        unselect={selecting && !$selection.includes(img.id)}
                        onClick={!selecting && ((e) => openImage(img, e))}
                        onContext={handleImgContext(img.id)}
                        onLoaded={() => handleImageLoaded(img.id)}
                    />
                </div>
            {/each}
        {/if}
    </div>
</div>

<div class="loader">
    {#if triggerOverride}
        <div><p>loading...</p></div>
    {:else if paginated.length === $imageAmountStore}
        <div><p>You've reached the end.</p></div>
    {:else}
        <div>
            <button on:click={loadMore}>
                (click here to load more images)
            </button>
        </div>
    {/if}
    <div class="spacer" />
</div>

<div class="spacer2" />

<ImageFull
    enabled={!!currentImage || !!live}
    image={live ? newestImage : currentImage}
    data={info}
    cancel={closeImage}
/>

{#if bulkOpen}
    <BulkModal
        imageCount={$imageAmountStore}
        searchParams={bulkSearchParams}
        on:close={() => (bulkOpen = false)}
        onComplete={handleBulkComplete}
    />
{/if}

<NavArrows
    onLeft={goLeft}
    onRight={goRight}
    left={leftArrow}
    right={rightArrow}
    hidden={live}
/>

{#if currentImage && !slideTimer}
    <div class="slideshow" transition:fade={{ duration: 100 }}>
        <Button on:click={() => startSlideshow()}>Slideshow</Button>
    </div>
{/if}

<style lang="scss">
    .topbar {
        position: sticky;
        top: 0;
        background-color: #242424;
        z-index: 2;
        padding-inline: calc(var(--main-padding) / 1);
        padding-top: calc(var(--main-padding) / 4);
        box-shadow: 0 35px 10px -32px rgba(0, 0, 0, 0.5);

        @media (width < 501px) {
            padding-inline: calc(var(--main-padding) / 2);
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
        }
    }

    .quickbar {
        display: flex;
        justify-content: space-between;
        gap: 0.5em;
        flex-wrap: wrap;
        align-items: center;
        user-select: none;
        font-family: "Open sans", sans-serif;
        font-size: 0.8em;
        color: #ddd;
        margin-bottom: 0.5em;

        .image-count .pending {
            opacity: 0.45;
        }
    }

    .nav {
        display: flex;
        gap: 0.5em;
        padding-bottom: 0.5em;

        & > :global(.input) {
            flex-grow: 1;
        }
    }

    .grid {
        padding: calc(var(--main-padding) / 2) var(--main-padding);
        min-height: 100vh;
        overflow-anchor: none;
        position: relative;

        .grid-content {
            opacity: 1;
            visibility: visible;

            > div[id^="img_"],
            .masonry-column > div {
                overflow-anchor: none;
            }

            .masonry-column {
                overflow-anchor: none;
            }

            display: grid;
            grid-template-columns: repeat(
                auto-fill,
                minmax(calc(200px + var(--size-offset)), 1fr)
            );
            gap: 0.8em;
        }

        &.resizing .grid-content {
            visibility: hidden;
            opacity: 0;
            transition: none;
            pointer-events: none;
        }

        &.revealing .grid-content {
            visibility: visible;
            opacity: 0;
            transition: none;
            pointer-events: none;
        }

        &.revealing.reveal-visible .grid-content {
            opacity: 1;
            transition: opacity 180ms ease;
            pointer-events: auto;
        }

        &.resizing:not(.masonry) .grid-content {
            grid-template-columns: repeat(
                var(--resize-columns, 1),
                minmax(calc(200px + var(--size-offset)), 1fr)
            );

            @media (width > 1200px) {
                grid-template-columns: repeat(
                    var(--resize-columns, 1),
                    minmax(calc(250px + var(--size-offset)), 1fr)
                );
            }

            @media (width < 501px) {
                grid-template-columns: repeat(
                    var(--resize-columns, 1),
                    minmax(calc(130px + var(--size-offset)), 1fr)
                );
            }
        }

        .resize-overlay {
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            opacity: 0;
            transition: opacity 180ms ease;
            z-index: 2;

            p {
                margin: 0;
                padding: 0.5em 1em;
                border-radius: 0.35em;
                background-color: rgba(36, 36, 36, 0.85);
                font-family: "Open sans", sans-serif;
                font-size: 0.9em;
                color: #bbb;
            }

            &.visible {
                opacity: 1;
            }
        }

        .masonry-probe {
            position: absolute;
            visibility: hidden;
            pointer-events: none;
            width: calc(200px + var(--size-offset));
            height: 0;
        }

        &.masonry .grid-content {
            display: flex;
            align-items: flex-start;
            gap: 0.8em;

            .masonry-column {
                display: flex;
                flex-direction: column;
                flex: 1;
                min-width: 0;
                gap: 0.8em;
            }
        }

        &.spacing-compact {
            padding: 5px;

            .grid-content {
                gap: 2px;
            }

            &.masonry .grid-content .masonry-column {
                gap: 2px;
            }
        }

        &.spacing-mosaic {
            padding: 0;

            .grid-content {
                gap: 0;
            }

            &.masonry .grid-content {
                gap: 0;

                .masonry-column {
                    gap: 0;
                }
            }
        }

        @media (width > 1200px) {
            .grid-content {
                grid-template-columns: repeat(
                    auto-fill,
                    minmax(calc(250px + var(--size-offset)), 1fr)
                );
            }

            .masonry-probe {
                width: calc(250px + var(--size-offset));
            }
        }

        @media (width < 501px) {
            padding: 5px;

            .grid-content {
                grid-template-columns: repeat(
                    auto-fill,
                    minmax(calc(130px + var(--size-offset)), 1fr)
                );
                gap: 0.2em;
            }

            .masonry-probe {
                width: calc(130px + var(--size-offset));
            }

            &.masonry .grid-content {
                gap: 0.2em;

                .masonry-column {
                    gap: 0.2em;
                }
            }

            &.spacing-compact {
                padding: 5px;

                .grid-content {
                    gap: 2px;
                }

                &.masonry .grid-content {
                    gap: 2px;

                    .masonry-column {
                        gap: 2px;
                    }
                }
            }

            &.spacing-mosaic {
                padding: 0;

                .grid-content {
                    gap: 0;
                }

                &.masonry .grid-content {
                    gap: 0;

                    .masonry-column {
                        gap: 0;
                    }
                }
            }
        }
    }

    .slideshow {
        position: fixed;
        top: 1.5em;
        right: calc(2em + var(--flyout-width));
        z-index: 5;

        :global(.flanimate) & {
            transition: right 0.2s ease;
        }
    }

    .spacer {
        height: 100px;
    }

    .spacer2 {
        height: 60vh;
    }

    .flexspacer {
        flex-grow: 1;
    }

    .loader {
        & > :global(:first-child) {
            display: flex;
            justify-content: center;
            margin-top: 1em;
        }

        p,
        button {
            background-color: transparent;
            border: none;
            font-family: "Open sans", sans-serif;
            font-size: 1em;
            color: #ddd;
            display: block;
            margin: 1em 0 0 0;
        }

        button {
            cursor: pointer;
        }
    }

    label {
        display: flex;
        align-items: center;
        gap: 0.5em;
        cursor: pointer;
        user-select: none;
    }

    input[type="checkbox"] {
        appearance: none;
        background-color: #333;
        border-radius: 0.2em;
        font-size: 1em;
        width: 13px;
        height: 13px;
        margin: 0;
        padding: 0;
        border: none;
        cursor: pointer;
        position: relative;
        outline: 1px solid #aaa3;

        &::before {
            content: "";
            position: absolute;
            background-color: rgb(63, 187, 236);
            top: 2px;
            left: 2px;
            right: 2px;
            bottom: 2px;
            transform: scale(0);
            opacity: 0;
            transition:
                120ms transform ease,
                120ms opacity ease;
            border-radius: 0.15em;
        }

        &:checked::before {
            transform: scale(1);
            opacity: 1;
        }
    }
</style>
