<script lang="ts">
    import NavArrows from "$lib/components/NavArrows.svelte";
    import { notify } from "$lib/components/Notifier.svelte";
    import Button from "$lib/items/Button.svelte";
    import VirtualImageDisplay from "$lib/items/VirtualImageDisplay.svelte";
    import ImageFull from "$lib/items/ImageFull.svelte";
    import Link from "$lib/items/Link.svelte";
    import SearchInput from "$lib/items/SearchInput.svelte";
    import Select from "$lib/items/Select.svelte";
    import { imageAmountStore, imageStore } from "$lib/stores/imageStore";
    import {
        fetchImagePage,
        generateCompressedImages,
        getImageInfo,
        imageAction,
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
        isNearBottom,
        isNearTop,
    } from "$lib/tools/scrollLoadMore";
    import { bindDropdownOutsideClick } from "$lib/tools/dropdownOutsideClick";
    import {
        AUTOLOAD_SUPPRESS_AFTER_LAYOUT_MS,
        applyColumnOrder,
        getGridMetrics,
        MasonryPlacer,
        RESIZE_DEBOUNCE_IMAGE_THRESHOLD,
        RESIZE_LAYOUT_DEBOUNCE_MS,
        sortColumnsByFirstItemIndex,
        type MasonryColumn,
        type MasonryMetrics,
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
    import { tagsAddableToSelection } from "$lib/types/tags";
    import { flyoutState } from "$lib/stores/flyoutStore";
    import BulkModal from "$lib/components/BulkModal.svelte";
    import FilterMultiSelect from "$lib/components/FilterMultiSelect.svelte";
    import QuickTagSetupModal from "$lib/components/QuickTagSetupModal.svelte";
    import QuickTagToolbar from "$lib/components/QuickTagToolbar.svelte";
    import type { BulkTagMode } from "$lib/stores/bulkStore";
    import {
        computeQuickTagResult,
        QUICK_TAG_COOLDOWN_MS,
        type QuickTagHistoryEntry,
    } from "$lib/tools/quickTag";

    type ActionMode = "manual" | "auto";

    const initialAmount = Math.max($initialImages, 1);
    const increment = Math.max(initialAmount, 25);
    let currentAmount = initialAmount;
    let currentImage: ClientImage | undefined = undefined;
    let inputElement: HTMLInputElement;
    let inputTimer: ReturnType<typeof setTimeout> | undefined;
    let info: ImageInfo | undefined = undefined;
    let slideTimer: ReturnType<typeof setInterval> | undefined;
    let slideDir: "left" | "right" = "right";
    let streamAbort: AbortController | undefined;
    let updateSessionId = 0;
    let searchSessionId = "";
    let lastImgSearchNotifyKey = "";
    let live = false;
    let sorting: SortingMethod = "date";
    let fetchingNextPage = false;
    let selecting = false;
    let navMenuOpen = false;
    let navEl: HTMLDivElement | undefined;
    let bulkOpen = false;
    let bulkSearchParams: SearchParams = buildSearchParams();
    let searchCountComplete = false;
    let quickTagActive = false;
    let quickTagSetupOpen = false;
    let quickTagMode: BulkTagMode = "add";
    let quickTagSelectedTags: string[] = [];
    let quickTagHistory: QuickTagHistoryEntry[] = [];
    let quickTagHiddenIds: string[] = [];
    let quickTagLastClickAt = 0;
    const quickTagInFlight = new Set<string>();
    const selection = createSelection();
    let anchorElement: HTMLDivElement;
    let scrollLoadSession = 0;
    let lastAutoLoadTime = 0;
    let scrollRaf: number | undefined;
    let masonryColumnOrder: number[] | null = null;
    let paginatedIndexById = new Map<string, number>();
    let cachedPaginatedIds: string[] = [];
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
    $: visiblePaginated = quickTagActive
        ? paginated.filter((img) => !quickTagHiddenIds.includes(img.id))
        : paginated;
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
    $: {
        const ids = paginated.map((x) => x.id);
        if (
            ids.length !== cachedPaginatedIds.length ||
            ids.some((id, index) => id !== cachedPaginatedIds[index])
        ) {
            cachedPaginatedIds = ids;
            selection.setObjects(ids);
        }
    }

    $: {
        paginated;
        const next = new Map<string, number>();
        paginated.forEach((image, index) => next.set(image.id, index));
        paginatedIndexById = next;
    }
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
        masonryColumnOrder = null;
    }

    $: if (masonryEnabled && gridElement) {
        visiblePaginated;
        quickTagActive;
        searchSessionId;
        $imageSize;
        $imageSpacing;
        sorting;
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

    function layoutMasonryColumns(metrics: MasonryMetrics): MasonryColumn[] {
        const images = quickTagActive ? visiblePaginated : paginated;
        const columns = masonryPlacer.layout(
            images,
            searchSessionId,
            metrics,
        );

        if (sorting !== "date") {
            masonryColumnOrder = null;
            return columns;
        }

        if (isNearTop()) {
            const sorted = sortColumnsByFirstItemIndex(columns, paginatedIndexById);
            masonryColumnOrder = sorted.map((column) => column.key);
            return sorted;
        }

        if (masonryColumnOrder) {
            return applyColumnOrder(columns, masonryColumnOrder);
        }

        return columns;
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
                masonryColumns = layoutMasonryColumns(metrics);
            }
            lastColumnCount = metrics.columnCount;
            return;
        }

        if (!columnCountChanged) {
            if (masonryReflow) {
                masonryColumns = layoutMasonryColumns(metrics);
            }
            return;
        }

        const anchor = captureScrollAnchor(gridElement);
        suppressAutoLoadBriefly();

        if (masonryReflow) {
            masonryColumns = layoutMasonryColumns(metrics);
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
            masonryColumns = layoutMasonryColumns(metrics);
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

    function closeNavMenu() {
        navMenuOpen = false;
    }

    function toggleNavMenu() {
        navMenuOpen = !navMenuOpen;
    }

    $: selecting, closeNavMenu();

    onMount(() => {
        scrollToTop();
        reconnectSearch();
        fetchFolderPaths().catch(() => {});

        const removeNavOutsideClick = bindDropdownOutsideClick(
            () => navMenuOpen,
            closeNavMenu,
            () => navEl,
        );

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
            removeNavOutsideClick();
            clearTimeout(inputTimer);
            if (resizeDebounceTimer !== undefined) {
                clearTimeout(resizeDebounceTimer);
            }
            clearGridReveal();
            updateSessionId++;
            streamAbort?.abort();
            streamAbort = undefined;
            stopSlideshow(false);
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
        stopSlideshow();
    }

    function openLive() {
        if (live) return;
        if (paginated.length === 0) return;
        if (currentImage) closeImage();
        live = true;
    }

    function goLeft(mode?: ActionMode) {
        if (leftArrow && prevIndex < 0) {
            if (mode !== "auto") {
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
        lastAutoLoadTime = 0;
        scrollLoadSession++;
    }

    function onScroll() {
        if (scrollRaf !== undefined) return;
        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = undefined;
            maybeAutoLoadMore();
        });
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

        return true;
    }

    function maybeAutoLoadMore() {
        if (!canAutoLoadMore() || !isNearBottom()) return;
        lastAutoLoadTime = Date.now();
        loadMore();
    }

    function handleImageLoaded() {
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

    function selectChange() {
        reconnectSearch();
    }

    function reconnectSearch() {
        streamAbort?.abort();
        streamAbort = undefined;
        searchSessionId = "";
        masonryColumnOrder = null;
        fetchingNextPage = false;
        const sessionId = ++updateSessionId;
        connectImageStream(sessionId);
    }

    function maybeNotifyImgSearchError(error: string | undefined, search: string) {
        if (!error) {
            lastImgSearchNotifyKey = "";
            return;
        }
        const key = `${search}\0${error}`;
        if (key === lastImgSearchNotifyKey) return;
        lastImgSearchNotifyKey = key;
        notify(error, "warn");
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
                    maybeNotifyImgSearchError(ready.imgSearchError, search.search);
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
        if ($imageStore.length === 0) return;
        if (!searchSessionId) return;
        if (fetchingNextPage) return;
        const sessionId = searchSessionId;
        const lastImage = $imageStore[$imageStore.length - 1];

        fetchingNextPage = true;

        try {
            const images = await fetchImagePage({
                latestId: "",
                oldestId: lastImage.id,
                sessionId,
            });
            
            if (sessionId !== searchSessionId) return;
            if (images.amount <= 0 || images.images.length === 0) return;

            const existingIds = new Set($imageStore.map((image) => image.id));
            const mapped = expandClientImages(
                images.images.filter((image) => !existingIds.has(image.id)),
            );
            if (!mapped.length) return;
            imageStore.update((x) => x.concat(mapped));
            imageAmountStore.set(images.amount);
        } catch (e) {
            console.error(e);
        } finally {
            fetchingNextPage = false;
        }
    }

    function applyUpdate(res: UpdateResponse, expectedSessionId: number) {
        if (expectedSessionId !== updateSessionId) return;
        if (res.timestamp === -1) return;

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

    function slideshowLoop(dir: "left" | "right") {
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
            slideTimer = setInterval(() => slideshowLoop("left"), slideshowInterval);
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
        if (isTextInputActive()) return;

        if (e.key === "ArrowLeft") {
            goLeft();
        } else if (e.key === "ArrowRight") {
            goRight();
        } else if (e.key === " ") {
            if (!currentImage) return;
            e.preventDefault();
            if (slideTimer) {
                stopSlideshow();
            } else {
                startSlideshow();
            }
        } else if (e.key === "f") {
            flyoutState.set(!$flyoutState);
        }
    }

    function isTextInputActive() {
        const active = document.activeElement;
        return active instanceof HTMLInputElement
            || active instanceof HTMLTextAreaElement
            || active instanceof HTMLSelectElement
            || (active instanceof HTMLElement && active.isContentEditable);
    }

    function handleEsc(e: KeyboardEvent) {
        if (e.key === "Escape" && quickTagSetupOpen) {
            closeQuickTagSetup();
            return;
        }
        if (e.key === "Escape" && quickTagActive) {
            void doneQuickTag();
            return;
        }
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
                        selectChange();
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
                        selectChange();
                    },
                },
                {
                    name: "Tag as...",
                    visible: $tagsStore.tags.length > 0 && (!selecting || $selection.length > 0),
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

    function normalizeFolderPath(folder: string): string {
        const normalized = folder.replace(/\\/g, "/");
        return normalized === "" || normalized === "/" ? "/" : normalized;
    }

    async function getImageFolderPaths(ids: string[]): Promise<string[]> {
        const folders = await Promise.all(
            ids.map(async (imageId) => {
                const info = await getImageInfo(imageId);
                return info ? normalizeFolderPath(info.folder) : undefined;
            }),
        );
        return folders.filter((folder): folder is string => folder !== undefined);
    }

    function formatFolderDisplay(folder: string): string {
        if (folder === "/") return folder;
        return folder.replace(/\//g, " > ");
    }

    async function folderActionMenu(
        id: string,
        type: "move" | "copy",
    ): Promise<ContextMenuOption[]> {
        const ids = selecting ? $selection : id ? [id] : [];
        const list = await fetchFolderPaths();

        let folders = list;
        if (type === "move" && ids.length > 0) {
            const imageFolders = await getImageFolderPaths(ids);
            const uniqueFolders = new Set(imageFolders);
            if (uniqueFolders.size === 1) {
                const currentFolder = [...uniqueFolders][0];
                folders = list.filter((folder) => folder !== currentFolder);
            }
        }

        return folders.map((folder) => ({
            name: formatFolderDisplay(folder),
            handler: () =>
                imageAction(selecting ? $selection : id, {
                    type,
                    folder,
                }),
        }));
    }

    async function tagActionMenu(id: string): Promise<ContextMenuOption[] | void> {
        try {
            const ids = selecting ? $selection : [id];
            if (!ids.length) return;

            const tagsByImage = await Promise.all(ids.map((imageId) => fetchImageTags(imageId)));
            const available = tagsAddableToSelection($tagsStore, tagsByImage);
            if (!available.length) {
                return [
                    {
                        name: ids.length === 1 ? "All tags on image" : "All tags on selection",
                        enabled: false,
                        handler: () => {},
                    },
                ];
            }

            return available.map((tag) => ({
                name: tag,
                handler: async () => {
                    await Promise.all(ids.map(async (imageId) => {
                        const current = await fetchImageTags(imageId);
                        if (current.includes(tag))
                            return;
                        await updateImageTags(imageId, [...current, tag]);
                    }));
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

    function openQuickTagSetup() {
        closeNavMenu();
        quickTagSetupOpen = true;
    }

    function closeQuickTagSetup() {
        quickTagSetupOpen = false;
    }

    function startQuickTag(event: CustomEvent<{ mode: BulkTagMode; tags: string[] }>) {
        const { mode, tags } = event.detail;
        quickTagMode = mode;
        quickTagSelectedTags = tags;
        quickTagHistory = [];
        quickTagHiddenIds = [];
        quickTagLastClickAt = 0;
        quickTagInFlight.clear();
        quickTagActive = true;
        quickTagSetupOpen = false;
        closeImage();
        cancelSelect();
    }

    function resetQuickTagState() {
        quickTagActive = false;
        quickTagSetupOpen = false;
        quickTagHistory = [];
        quickTagHiddenIds = [];
        quickTagLastClickAt = 0;
        quickTagInFlight.clear();
    }

    async function undoQuickTag() {
        const entry = quickTagHistory.at(-1);
        if (!entry) return;

        quickTagHistory = quickTagHistory.slice(0, -1);
        try {
            await updateImageTags(entry.imageId, entry.originalTags);
            quickTagHiddenIds = quickTagHiddenIds.filter((id) => id !== entry.imageId);
        } catch (cause) {
            console.error(cause);
            quickTagHistory = [...quickTagHistory, entry];
            notify(cause instanceof Error ? cause.message : "Undo failed", "warn");
        }
    }

    async function revertQuickTag() {
        if (!quickTagHistory.length) return;

        const confirmed = await askConfirmation(
            "Revert tagging",
            `Revert ${quickTagHistory.length} tagged image${quickTagHistory.length === 1 ? "" : "s"} to their original tags?`,
        );
        if (!confirmed) return;

        const entries = [...quickTagHistory].reverse();
        try {
            for (const entry of entries) {
                await updateImageTags(entry.imageId, entry.originalTags);
            }
            resetQuickTagState();
        } catch (cause) {
            console.error(cause);
            notify(cause instanceof Error ? cause.message : "Revert failed", "warn");
        }
    }

    async function doneQuickTag() {
        if (quickTagHistory.length > 0) {
            const confirmed = await askConfirmation(
                "Exit quick tag",
                "Exit quick tag? You will lose the ability to undo or revert recent changes.",
            );
            if (!confirmed) return;
        }
        resetQuickTagState();
    }

    async function handleQuickTagImage(img: ClientImage, e?: MouseEvent | KeyboardEvent) {
        if (e && e instanceof MouseEvent && e.button !== 0) return;
        if (!quickTagSelectedTags.length) {
            notify("Select at least one tag", "warn");
            return;
        }
        if (quickTagHiddenIds.includes(img.id) || quickTagInFlight.has(img.id)) return;

        const now = Date.now();
        if (now - quickTagLastClickAt < QUICK_TAG_COOLDOWN_MS) return;

        quickTagInFlight.add(img.id);
        try {
            const originalTags = await fetchImageTags(img.id);
            const newTags = computeQuickTagResult(
                originalTags,
                quickTagSelectedTags,
                quickTagMode,
            );
            const savedTags = await updateImageTags(img.id, newTags);
            quickTagHistory = [
                ...quickTagHistory,
                {
                    imageId: img.id,
                    originalTags,
                    newTags: savedTags,
                },
            ];
            quickTagHiddenIds = [...quickTagHiddenIds, img.id];
            quickTagLastClickAt = Date.now();
        } catch (cause) {
            console.error(cause);
            notify(cause instanceof Error ? cause.message : "Tagging failed", "warn");
        } finally {
            quickTagInFlight.delete(img.id);
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
            on:change={selectChange}
        />

        <Select
            id="collapse"
            prefix="Collapse"
            bind:value={$explorationMode}
            options={explorationModes}
            on:change={selectChange}
        />

        <FilterMultiSelect onChange={selectChange} />

        {#if $showNsfwFilter}
            <label for="nsfw">
                NSFW:
                <input
                    type="checkbox"
                    id="nsfw"
                    bind:checked={$nsfwMode}
                    on:change={selectChange}
                />
            </label>
        {/if}
    </div>

    {#if quickTagActive}
        <div class="nav quick-tag-nav">
            <QuickTagToolbar
                tagMode={quickTagMode}
                bind:selectedTags={quickTagSelectedTags}
                canUndo={quickTagHistory.length > 0}
                canRevert={quickTagHistory.length > 0}
                on:undo={undoQuickTag}
                on:revert={revertQuickTag}
                on:done={doneQuickTag}
            />
        </div>
    {:else if !selecting}
        <div class="nav" bind:this={navEl}>
            <SearchInput
                bind:element={inputElement}
                bind:value={$searchFilter}
                placeholder="Search"
                on:input={inputChange}
            />
            <div class="nav-burger-menu">
                <button
                    type="button"
                    class="nav-menu-toggle"
                    aria-expanded={navMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Actions menu"
                    on:click|stopPropagation={toggleNavMenu}
                >
                    <span class="burger" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                    </span>
                </button>
                <div class="nav-burger-actions" class:open={navMenuOpen} role="menu">
                    <Button
                        on:click={() => {
                            closeNavMenu();
                            selecting = true;
                        }}>Select</Button
                    >
                    <Button
                        on:click={() => {
                            closeNavMenu();
                            openQuickTagSetup();
                        }}>Quick tag</Button
                    >
                    <div class="nav-collapsed-actions">
                        <Button
                            on:click={() => {
                                closeNavMenu();
                                openLive();
                            }}>Live</Button
                        >
                        <Button
                            on:click={() => {
                                closeNavMenu();
                                openBulk();
                            }}>Bulk</Button
                        >
                        <Link to="/settings" on:click={closeNavMenu}>Settings</Link>
                    </div>
                </div>
            </div>
            <div class="nav-actions">
                <Button on:click={openLive}>Live</Button>
                <Button on:click={openBulk}>Bulk</Button>
                <Link to="/settings">Settings</Link>
            </div>
        </div>
    {:else}
        <div class="nav selection-nav" bind:this={navEl}>
            <div class="nav-actions" role="menu">
                <Button
                    on:click={deleteSelected}>Delete</Button
                >
                <Button
                    on:click={(e) => void handleSelectionButton("move")(e)}>Move</Button
                >
                <Button
                    on:click={(e) => void handleSelectionButton("copy")(e)}>Copy</Button
                >
                <Button on:click={fillSelected}>Fill</Button
                >
                <div class="flexspacer" />
                <Button on:click={cancelSelect}>Cancel</Button>
            </div>
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
                            <VirtualImageDisplay
                                {img}
                                loadSession={scrollLoadSession}
                                selected={selecting &&
                                    $selection.includes(img.id)}
                                onClick={quickTagActive
                                    ? ((e) => handleQuickTagImage(img, e))
                                    : !selecting && ((e) => openImage(img, e))}
                                onContext={handleImgContext(img.id)}
                                onLoaded={handleImageLoaded}
                            />
                        </div>
                    {/each}
                </div>
            {/each}
        {:else}
            {#each visiblePaginated as img (img.id)}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <div id={`img_${img.id}`} class:selecting on:click={selectImg(img.id)}>
                    <VirtualImageDisplay
                        {img}
                        loadSession={scrollLoadSession}
                        selected={selecting && $selection.includes(img.id)}
                        onClick={quickTagActive
                            ? ((e) => handleQuickTagImage(img, e))
                            : !selecting && ((e) => openImage(img, e))}
                        onContext={handleImgContext(img.id)}
                        onLoaded={handleImageLoaded}
                    />
                </div>
            {/each}
        {/if}
    </div>
</div>

<div class="loader">
    {#if fetchingNextPage}
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
        searchSessionId={searchSessionId}
        {sorting}
        on:close={() => (bulkOpen = false)}
        onComplete={handleBulkComplete}
    />
{/if}

{#if quickTagSetupOpen}
    <QuickTagSetupModal
        bind:tagMode={quickTagMode}
        bind:selectedTags={quickTagSelectedTags}
        on:start={startQuickTag}
        on:close={closeQuickTagSetup}
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
    @use "$lib/items/dropdownAnimations.scss" as dropdown;

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
        font-size: 0.8em;
        color: #ddd;
        margin-bottom: 0.5em;

        .image-count .pending {
            opacity: 0.45;
        }
    }

    .nav {
        container-type: inline-size;
        container-name: nav;
        position: relative;
        display: flex;
        gap: 0.5em;
        align-items: center;
        padding-bottom: 0.5em;

        & > :global(.input) {
            flex: 1 1 0;
            min-width: 0;
        }
    }

    .nav-burger-menu {
        position: relative;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        align-self: center;
    }

    .nav-menu-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        appearance: none;
        margin: 0;
        padding: 0.45em;
        border: none;
        border-radius: 0.35em;
        background: transparent;
        color: #ddd;
        cursor: pointer;
        line-height: 0;
        transition: background-color 0.12s ease;

        .burger {
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 0.22em;
            width: 1.1em;
            height: 1em;

            span {
                display: block;
                height: 2px;
                border-radius: 1px;
                background: currentColor;
            }
        }

        &:hover,
        &:focus-visible {
            background: #ffffff10;
        }

        &:active {
            background: #ffffff18;
        }

        &:focus {
            outline: none;
        }
    }

    .nav-actions {
        display: flex;
        gap: 0.5em;
        flex-shrink: 0;
        align-items: center;
    }

    .nav-burger-actions {
        display: none;
        gap: 0.5em;
        flex-shrink: 0;

        &.open {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: calc(100% - 0.5em);
            right: 0;
            z-index: 10;
            box-sizing: border-box;
            gap: 0.15em;
            width: max-content;
            min-width: 6.5em;
            max-width: min(12em, 100%);
            padding: 0.25em;
            background: #2a2a2a;
            border-radius: 0.35em;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
            @include dropdown.panel-animation;

            :global(a),
            :global(button) {
                box-sizing: border-box;
                display: block;
                width: 100%;
                min-width: 0;
                margin: 0;
                padding: 0.35em 0.55em;
                border: none;
                border-radius: 0.25em;
                background: transparent;
                color: #ddd;
                font-size: 0.8rem;
                line-height: 1.2;
                text-align: left;
                text-decoration: none;
                transform: none;
                transition: background-color 0.12s ease;

                &:hover,
                &:focus-visible {
                    background: #ffffff12;
                    border-color: transparent;
                    transform: none;
                }

                &:active {
                    background: #ffffff1a;
                    transform: none;
                }
            }
        }
    }

    .nav-collapsed-actions {
        display: none;
        flex-direction: column;
        gap: 0.15em;
    }

    .nav.quick-tag-nav {
        & > :global(.quick-tag-toolbar) {
            width: 100%;
        }
    }

    @container nav (max-width: 540px) {
        .nav-actions {
            display: none;
        }

        .nav-burger-actions.open .nav-collapsed-actions {
            display: flex;
        }

        .flexspacer {
            display: none;
        }
    }

    .nav.selection-nav {
        .nav-actions {
            flex: 1;
        }

        @container nav (max-width: 540px) {
            .nav-actions {
                display: flex;
                flex-direction: row;
                position: static;
                width: auto;
                min-width: 0;
                max-width: none;
                padding: 0;
                background: transparent;
                border-radius: 0;
                box-shadow: none;
                gap: 0.5em;
            }

            .flexspacer {
                display: block;
            }
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
