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
        fetchImagePage,
        generateCompressedImages,
        getImageInfo,
        imageAction,
        subscribeImageStream,
    } from "$lib/requests/imageRequests";
    import { expandClientImages, formatSearchDateMinute } from "$lib/tools/misc";
    import { isGeneratedQualityMode } from "$lib/types/misc";
    import {
        explorationModes,
        similaritySortingMethods,
        uniquenessSortingMethods,
        sortingMethods,
        type InputEvent,
        type SortingMethod,
    } from "$lib/types/misc";
    import { hasSimilaritySearchParts, hasMmrSearchParts, tokenizeSearchClauses } from "$lib/tools/searchParsing";
    import { syncTemporarySorts, type TemporarySortState } from "$lib/tools/similaritySort";
    import { afterUpdate, onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import { fade } from "svelte/transition";
    import {
        nsfwMode,
        showNsfwFilter,
        searchFilter,
        explorationMode,
        sparseFrequency,
        similarityAlgorithm,
        matchingMode,
        compressedMode,
        slideDelay,
        useSmartSubsampling,
        buildSearchParams,
        syncSearchInput,
        similarityThreshold,
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
        getVisibleTilesForGrid,
        layoutGridTiles,
        layoutMasonryTiles,
        type GalleryLayout,
        type GalleryTile,
    } from "$lib/tools/galleryLayout";
    import {
        AUTOLOAD_SUPPRESS_AFTER_LAYOUT_MS,
        getGridMetrics,
        MasonryPlacer,
        RESIZE_DEBOUNCE_IMAGE_THRESHOLD,
        RESIZE_LAYOUT_DEBOUNCE_MS,
        type MasonryMetrics,
    } from "$lib/tools/masonryLayout";
    import {
        captureScrollAnchorFromLayouts,
        findNearestViewportLayout,
        restoreScrollAnchorFromLayout,
        scrollLayoutIntoView,
        type ScrollAnchor,
    } from "$lib/tools/scrollAnchor";
    import {
        isSearchHistoryState,
        maxSearchHistoryEntries,
        type OverlayKind,
        type SearchHistorySnapshot,
        type SearchHistoryState,
    } from "$lib/tools/searchHistory";
    import type { ClientImage, ImageInfo } from "$lib/types/images";
    import type { UpdateResponse } from "$lib/types/requests";
    import { fetchFolderPaths } from "$lib/requests/miscRequests";
    import { fetchImageTags, updateImageTags } from "$lib/requests/tagRequests";
    import { tagsStore } from "$lib/stores/tagsStore";
    import { isExactTagTerm, tagsAddableToSelection } from "$lib/types/tags";
    import { flyoutState } from "$lib/stores/flyoutStore";
    import BulkModal from "$lib/components/BulkModal.svelte";
    import { embeddingStore, isEmbeddingConfigured } from "$lib/stores/embeddingStore";
    import FilterMultiSelect from "$lib/components/FilterMultiSelect.svelte";
    import QuickTagSetupModal from "$lib/components/QuickTagSetupModal.svelte";
    import QuickTagToolbar from "$lib/components/QuickTagToolbar.svelte";
    import type { BulkTagMode } from "$lib/stores/bulkStore";
    import {
        computeQuickTagResult,
        loadQuickTagSelectedTags,
        QUICK_TAG_COOLDOWN_MS,
        saveQuickTagSelectedTags,
        type QuickTagHistoryEntry,
    } from "$lib/tools/quickTag";

    type ActionMode = "manual" | "auto";

    /** Fixed client pagination chunk; DOM cost is bounded by windowing. */
    const GALLERY_PAGE_SIZE = 500;
    const initialAmount = GALLERY_PAGE_SIZE;
    const increment = GALLERY_PAGE_SIZE;
    let currentAmount = initialAmount;
    let currentImage: ClientImage | undefined = undefined;
    let inputElement: HTMLInputElement;
    let inputSearchTimer: ReturnType<typeof setTimeout> | undefined;
    let searchHistoryTimer: ReturnType<typeof setTimeout> | undefined;
    let info: ImageInfo | undefined = undefined;
    let slideTimer: ReturnType<typeof setInterval> | undefined;
    let slideDir: "left" | "right" = "right";
    let streamAbort: AbortController | undefined;
    let streamRecoveryTimer: ReturnType<typeof setTimeout> | undefined;
    let pageWasHidden = false;
    const STREAM_RECOVERY_DEBOUNCE_MS = 300;
    let updateSessionId = 0;
    let searchSessionId = "";
    let lastImgSearchNotifyKey = "";
    let lastMmrSearchNotifyKey = "";
    let lastImgSimSearchNotifyKey = "";
    let live = false;
    let sorting: SortingMethod = "date";
    let temporarySortState: TemporarySortState = {
        similarity: { active: false },
        uniqueness: { active: false },
    };
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
    let quickTagSelectedTagsLoaded = false;
    let quickTagHistory: QuickTagHistoryEntry[] = [];
    let quickTagHiddenIds = new Set<string>();
    let quickTagLastClickAt = 0;
    const quickTagInFlight = new Set<string>();
    const selection = createSelection();
    let anchorElement: HTMLDivElement;
    let scrollLoadSession = 0;
    let lastAutoLoadTime = 0;
    let scrollRaf: number | undefined;
    let masonryColumnOrder: number[] | null = null;
    let paginatedIndexById = new Map<string, number>();
    let galleryImageById = new Map<string, ClientImage>();
    let cachedPaginatedIds: string[] = [];
    const masonryPlacer = new MasonryPlacer();
    let gridElement: HTMLDivElement | undefined;
    let galleryLayout: GalleryLayout = {
        tiles: [],
        byId: new Map(),
        totalHeight: 0,
    };
    let visibleTiles: GalleryTile[] = [];
    let viewportImageIndex = 0;
    let pendingHistoryAnchorId = "";
    let galleryLayoutRaf: number | undefined;
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
    let suppressAutoLoadUntil = 0;
    let searchHistoryEntries = 0;
    let currentHistoryId = "";
    let activeOverlay: OverlayKind | undefined;
    const galleryCache = new Map<string, ClientImage[]>();
    const SEARCH_HISTORY_DEBOUNCE_MS = 5_000;

    $: paginated = $imageStore.slice(0, currentAmount);
    $: galleryImages = quickTagActive
        ? $imageStore
            .filter((image) => !quickTagHiddenIds.has(image.id))
            .slice(0, currentAmount)
        : paginated;
    $: prevIndex = !currentImage
        ? -1
        : galleryImages.findIndex((img) => img.id === currentImage?.id) - 1;
    $: nextIndex = !currentImage
        ? -1
        : galleryImages.findIndex((img) => img.id === currentImage?.id) + 1;
    $: rightArrow = live || (nextIndex >= 0 && nextIndex < galleryImages.length);
    $: leftArrow = (rightArrow || nextIndex == galleryImages.length) && !live;
    $: newestImage = galleryImages[0];
    $: spacingCompact = $imageSpacing === "compact";
    $: spacingMosaic = $imageSpacing === "mosaic";
    $: {
        const ids = galleryImages.map((x) => x.id);
        if (
            ids.length !== cachedPaginatedIds.length ||
            ids.some((id, index) => id !== cachedPaginatedIds[index])
        ) {
            cachedPaginatedIds = ids;
            selection.setObjects(ids);
        }
    }

    $: {
        galleryImages;
        const nextIndex = new Map<string, number>();
        const nextImages = new Map<string, ClientImage>();
        galleryImages.forEach((image, index) => {
            nextIndex.set(image.id, index);
            nextImages.set(image.id, image);
        });
        paginatedIndexById = nextIndex;
        galleryImageById = nextImages;
    }
    $: slideshowInterval = Math.max($slideDelay, 100);
    $: masonryEnabled = $imageFlow === "masonry";
    $: sortingOptions = [
        ...sortingMethods,
        ...(hasSimilaritySearchParts($searchFilter) ? similaritySortingMethods : []),
        ...(hasMmrSearchParts($searchFilter) ? uniquenessSortingMethods : []),
    ];
    $: gridStyle = buildGridStyle(
        $imageSize,
        gridResizing,
        resizePreserveHeight,
        galleryLayout.totalHeight,
    );
    $: if (quickTagSelectedTagsLoaded) {
        try {
            saveQuickTagSelectedTags(localStorage, quickTagSelectedTags);
        } catch {
            // Storage may be unavailable or full.
        }
    }

    $: if (!masonryEnabled) {
        masonryPlacer.reset("");
        masonryColumnOrder = null;
    }

    $: if (gridElement) {
        galleryImages;
        searchSessionId;
        $imageSize;
        $imageSpacing;
        masonryEnabled;
        scheduleGalleryLayout();
    }

    function scheduleGalleryLayout() {
        if (galleryLayoutRaf !== undefined) cancelAnimationFrame(galleryLayoutRaf);
        galleryLayoutRaf = requestAnimationFrame(() => {
            galleryLayoutRaf = undefined;
            void updateGalleryLayout();
        });
    }

    function suppressAutoLoadBriefly() {
        suppressAutoLoadUntil =
            Date.now() + AUTOLOAD_SUPPRESS_AFTER_LAYOUT_MS;
        lastAutoLoadTime = Date.now();
    }

    function captureGalleryScrollAnchor(): ScrollAnchor | null {
        if (!gridElement) return null;
        return captureScrollAnchorFromLayouts(
            galleryLayout.tiles,
            gridElement.getBoundingClientRect().top,
        );
    }

    async function restoreScrollAfterLayout(anchor: ScrollAnchor | null) {
        if (!anchor || !gridElement) return;
        const id = anchor.id.startsWith("img_")
            ? anchor.id.slice(4)
            : anchor.id;
        restoreScrollAnchorFromLayout(
            anchor,
            galleryLayout.byId.get(id),
            gridElement,
        );
        await tick();
        requestAnimationFrame(() => {
            if (!gridElement) return;
            restoreScrollAnchorFromLayout(
                anchor,
                galleryLayout.byId.get(id),
                gridElement,
            );
        });
    }

    function computeGalleryLayout(metrics: MasonryMetrics): GalleryLayout {
        if (masonryEnabled) {
            const result = layoutMasonryTiles(
                masonryPlacer,
                galleryImages,
                searchSessionId,
                metrics,
                {
                    columnOrder: masonryColumnOrder,
                    itemIndex: paginatedIndexById,
                    nearTop: isNearTop(),
                },
            );
            masonryColumnOrder =
                result.columnOrder.length > 0 ? result.columnOrder : null;
            return result.layout;
        }

        return layoutGridTiles(galleryImages, metrics);
    }

    function refreshVisibleTiles() {
        if (!gridElement) {
            visibleTiles = [];
            viewportImageIndex = 0;
            return;
        }
        visibleTiles = getVisibleTilesForGrid(gridElement, galleryLayout.tiles);
        updateViewportImageIndex();
        tryRestorePendingHistoryAnchor();
    }

    function updateViewportImageIndex() {
        if (!gridElement || galleryLayout.tiles.length === 0) {
            viewportImageIndex = 0;
            return;
        }
        const nearest = findNearestViewportLayout(
            galleryLayout.tiles,
            gridElement.getBoundingClientRect().top,
        );
        if (!nearest) {
            viewportImageIndex = 0;
            return;
        }
        const index = paginatedIndexById.get(nearest.id);
        viewportImageIndex = index === undefined ? 0 : index + 1;
    }

    function getViewportAnchorImageId(): string {
        if (!gridElement || galleryLayout.tiles.length === 0) return "";
        const nearest = findNearestViewportLayout(
            galleryLayout.tiles,
            gridElement.getBoundingClientRect().top,
        );
        return nearest?.id ?? "";
    }

    function ensureCurrentAmountCoversImage(imageId: string) {
        if (!imageId) return;
        const index = paginatedIndexById.get(imageId);
        if (index !== undefined && currentAmount <= index) {
            currentAmount = index + 1;
        } else {
            const storeIndex = visibleGalleryIndex(imageId);
            if (storeIndex >= 0 && currentAmount <= storeIndex) {
                currentAmount = storeIndex + 1;
            }
        }
    }

    function scrollToAnchorImage(imageId: string, fallbackScrollY?: number) {
        if (!gridElement) return;
        const layout = galleryLayout.byId.get(imageId);
        if (layout) {
            scrollLayoutIntoView(layout, gridElement, "center");
            refreshVisibleTiles();
            return;
        }
        if (fallbackScrollY !== undefined) {
            window.scrollTo({ top: fallbackScrollY, behavior: "auto" });
            refreshVisibleTiles();
        }
    }

    function tryRestorePendingHistoryAnchor() {
        if (!pendingHistoryAnchorId || !gridElement) return;
        ensureCurrentAmountCoversImage(pendingHistoryAnchorId);
        const layout = galleryLayout.byId.get(pendingHistoryAnchorId);
        if (!layout) return;
        pendingHistoryAnchorId = "";
        scrollLayoutIntoView(layout, gridElement, "center");
        updateViewportImageIndex();
    }

    async function updateGalleryLayout() {
        if (!gridElement) return;
        await tick();
        await applyColumnCountChange(getGridMetrics(gridElement));
    }

    async function applyColumnCountChange(metrics: MasonryMetrics) {
        if (!gridElement) return;

        const columnCountChanged =
            lastColumnCount !== 0 &&
            metrics.columnCount !== lastColumnCount;

        if (lastColumnCount === 0) {
            galleryLayout = computeGalleryLayout(metrics);
            refreshVisibleTiles();
            lastColumnCount = metrics.columnCount;
            return;
        }

        if (!columnCountChanged) {
            galleryLayout = computeGalleryLayout(metrics);
            refreshVisibleTiles();
            return;
        }

        const anchor = captureGalleryScrollAnchor();
        suppressAutoLoadBriefly();

        galleryLayout = computeGalleryLayout(metrics);
        refreshVisibleTiles();
        await tick();

        await restoreScrollAfterLayout(anchor);
        lastColumnCount = metrics.columnCount;
    }

    function buildGridStyle(
        imageSize: string,
        resizing: boolean,
        preserveHeight: number,
        galleryHeight: number,
    ) {
        const parts = [
            `--size-offset:${parseSizeOffset(imageSize)}`,
            `--gallery-height:${galleryHeight}px`,
        ];
        if (resizing && preserveHeight > 0) {
            parts.push(`min-height:${preserveHeight}px`);
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
        resizeAnchor = captureGalleryScrollAnchor();
        resizePreserveHeight = gridElement.offsetHeight;
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

        if (columnCountChanged) {
            galleryLayout = computeGalleryLayout(metrics);
            refreshVisibleTiles();
            await tick();
        } else {
            galleryLayout = computeGalleryLayout(metrics);
            refreshVisibleTiles();
        }

        gridResizing = false;
        resizePreserveHeight = 0;
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
        try {
            quickTagSelectedTags = loadQuickTagSelectedTags(localStorage);
        } catch {
            // Storage may be unavailable.
        } finally {
            quickTagSelectedTagsLoaded = true;
        }
        if (!isSearchHistoryState(history.state)) {
            history.replaceState(
                { kind: "baseline", searchHistory: true } satisfies SearchHistoryState,
                "",
            );
        }
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
        window.addEventListener("popstate", handleHistoryPopState);
        document.addEventListener("visibilitychange", handleVisibilityRecovery);
        window.addEventListener("pageshow", handlePageShowRecovery);
        window.addEventListener("online", handleOnlineRecovery);

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
            clearTimeout(inputSearchTimer);
            clearTimeout(streamRecoveryTimer);
            clearTimeout(searchHistoryTimer);
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
            window.removeEventListener("popstate", handleHistoryPopState);
            document.removeEventListener("visibilitychange", handleVisibilityRecovery);
            window.removeEventListener("pageshow", handlePageShowRecovery);
            window.removeEventListener("online", handleOnlineRecovery);
            if (scrollRaf !== undefined) cancelAnimationFrame(scrollRaf);
            if (galleryLayoutRaf !== undefined) cancelAnimationFrame(galleryLayoutRaf);
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

        if (isGeneratedQualityMode($compressedMode)) {
            const currentImages = $imageStore;
            const startIndex = Math.max(
                0,
                currentImages.findIndex((img) => img.id === currentImage?.id) -
                    10,
            );
            const endIndex = Math.min(currentImages.length, startIndex + 50);
            setTimeout(() => {
                console.log(
                    `Generating ${$compressedMode} images ${startIndex} - ${endIndex}`,
                );
                generateCompressedImages(
                    currentImages.map((x) => x.id).slice(startIndex, endIndex),
                    $compressedMode,
                    $useSmartSubsampling,
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
        if (galleryImages.length === 0) return;
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
            currentImage = galleryImages[prevIndex];
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
            openImage(galleryImages[0]);
        } else if (rightArrow) {
            currentImage = galleryImages[nextIndex];
            if (nextIndex == galleryImages.length - 1) {
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
        if (!currentImage || !gridElement) return;
        const layout = galleryLayout.byId.get(currentImage.id);
        if (!layout) return;
        scrollLayoutIntoView(layout, gridElement, "center");
        refreshVisibleTiles();
    }

    function visibleGalleryIndex(imageId: string): number {
        const images = get(imageStore);
        const hiddenIds = quickTagActive ? quickTagHiddenIds : new Set<string>();
        let index = 0;
        for (const image of images) {
            if (!hiddenIds.has(image.id)) {
                if (image.id === imageId) return index;
                index++;
            }
        }
        return -1;
    }

    async function scrollGalleryImageIntoView(imageId: string) {
        const visibleIndex = visibleGalleryIndex(imageId);
        if (visibleIndex >= 0 && currentAmount <= visibleIndex) {
            currentAmount = visibleIndex + 1;
        }
        await tick();
        if (!gridElement) return;
        galleryLayout = computeGalleryLayout(getGridMetrics(gridElement));
        const layout = galleryLayout.byId.get(imageId);
        if (!layout) return;
        scrollLayoutIntoView(layout, gridElement, "center");
        refreshVisibleTiles();
    }

    function scrollToTop() {
        anchorElement.scrollIntoView();
    }

    function createHistoryId() {
        return crypto.randomUUID();
    }

    function createSearchSnapshot(): SearchHistorySnapshot {
        const params = buildSearchParams();
        return {
            kind: "search",
            id: currentHistoryId || createHistoryId(),
            searchInput: $searchFilter,
            params,
            sorting,
            sessionId: searchSessionId,
            currentAmount,
            oldestImageId: $imageStore.at(-1)?.id ?? "",
            anchorImageId: getViewportAnchorImageId(),
            scrollY: window.scrollY,
        };
    }

    function replaceCurrentSearchHistory() {
        if (!currentHistoryId || activeOverlay) return;
        const snapshot = createSearchSnapshot();
        currentHistoryId = snapshot.id;
        galleryCache.set(snapshot.id, get(imageStore));
        history.replaceState(
            { kind: "search", searchHistory: true, snapshot } satisfies SearchHistoryState,
            "",
        );
    }

    function pushSearchHistory() {
        // Always allocate a new id so the previous entry's galleryCache is not overwritten.
        const snapshot: SearchHistorySnapshot = {
            ...createSearchSnapshot(),
            id: createHistoryId(),
        };
        currentHistoryId = snapshot.id;
        galleryCache.set(snapshot.id, get(imageStore));
        if (searchHistoryEntries >= maxSearchHistoryEntries) {
            history.replaceState(
                { kind: "search", searchHistory: true, snapshot } satisfies SearchHistoryState,
                "",
            );
            return;
        }

        searchHistoryEntries++;
        history.pushState(
            { kind: "search", searchHistory: true, snapshot } satisfies SearchHistoryState,
            "",
        );
    }

    function scheduleSearchCommit() {
        clearTimeout(searchHistoryTimer);
        searchHistoryTimer = setTimeout(() => {
            pushSearchHistory();
        }, SEARCH_HISTORY_DEBOUNCE_MS);
    }

    function commitSearchNow() {
        clearTimeout(searchHistoryTimer);
        pushSearchHistory();
        reconnectSearch();
    }

    function setOverlayOpen(overlay: OverlayKind, open: boolean) {
        switch (overlay) {
            case "selection":
                selecting = open;
                break;
            case "bulk":
                bulkOpen = open;
                break;
            case "quick-tag-setup":
                quickTagSetupOpen = open;
                break;
            case "quick-tag":
                quickTagActive = open;
                break;
            default: {
                const _exhaustive: never = overlay;
                return _exhaustive;
            }
        }
    }

    function openOverlay(overlay: OverlayKind) {
        if (activeOverlay === overlay) return;
        activeOverlay = overlay;
        history.pushState(
            { kind: "overlay", searchHistory: true, overlay } satisfies SearchHistoryState,
            "",
        );
        setOverlayOpen(overlay, true);
    }

    function closeOverlay(overlay: OverlayKind) {
        if (activeOverlay === overlay) {
            history.back();
            return;
        }
        setOverlayOpen(overlay, false);
    }

    function closeOverlayFromHistory() {
        const overlay = activeOverlay;
        activeOverlay = undefined;
        if (!overlay) return;
        setOverlayOpen(overlay, false);
        if (overlay === "selection") selection.deselectAll();
        if (overlay === "quick-tag") resetQuickTagState();
    }

    async function hydrateSearchSession(snapshot: SearchHistorySnapshot) {
        if (!snapshot.sessionId) return false;

        try {
            let page = await fetchImagePage({
                latestId: "",
                oldestId: "",
                sessionId: snapshot.sessionId,
            });
            let images = expandClientImages(page.images);

            const hasAnchor = () =>
                !snapshot.anchorImageId
                || images.some((image) => image.id === snapshot.anchorImageId);

            while (
                images.length < page.amount
                && images.length > 0
                && (images.length < snapshot.currentAmount || !hasAnchor())
            ) {
                const next = await fetchImagePage({
                    latestId: "",
                    oldestId: images.at(-1)?.id ?? "",
                    sessionId: snapshot.sessionId,
                });
                const existingIds = new Set(images.map((image) => image.id));
                const appended = expandClientImages(
                    next.images.filter((image) => !existingIds.has(image.id)),
                );
                if (!appended.length) break;
                images = images.concat(appended);
                page = next;
            }

            imageStore.set(images);
            imageAmountStore.set(page.amount);
            galleryCache.set(snapshot.id, images);
            return true;
        } catch (cause) {
            if (!isSessionUnavailable(cause)) console.error(cause);
            return false;
        }
    }

    async function restoreSearchSnapshot(snapshot: SearchHistorySnapshot) {
        currentHistoryId = snapshot.id;
        pendingHistoryAnchorId = "";
        // Invalidate in-flight stream callbacks, then abort the outgoing search.
        const sessionId = ++updateSessionId;
        streamAbort?.abort();
        streamAbort = undefined;
        searchFilter.set(snapshot.searchInput);
        sorting = snapshot.sorting;
        explorationMode.set(snapshot.params.explorationMode);
        sparseFrequency.set(snapshot.params.sparseFrequency);
        similarityAlgorithm.set(snapshot.params.similarityAlgorithm);
        matchingMode.set(snapshot.params.matching);
        currentAmount = Math.max(snapshot.currentAmount, initialAmount);

        // Drop the outgoing gallery immediately so the previous search cannot linger.
        galleryLayout = { tiles: [], byId: new Map(), totalHeight: 0 };
        visibleTiles = [];
        viewportImageIndex = 0;

        const cached = galleryCache.get(snapshot.id);
        if (cached) {
            imageStore.set(cached);
            imageAmountStore.set(Math.max(snapshot.currentAmount, cached.length));
        } else {
            imageStore.set([]);
            const hydrated = await hydrateSearchSession(snapshot);
            if (!hydrated) {
                if (snapshot.anchorImageId) {
                    pendingHistoryAnchorId = snapshot.anchorImageId;
                }
                reconnectSearch();
                return;
            }
        }

        searchSessionId = snapshot.sessionId;
        connectImageStream(sessionId, snapshot.sessionId || undefined);

        await tick();
        // Rebuild index maps from restored store before expanding currentAmount.
        const restoredImages = get(imageStore);
        const nextIndex = new Map<string, number>();
        restoredImages.forEach((image, index) => nextIndex.set(image.id, index));
        paginatedIndexById = nextIndex;

        ensureCurrentAmountCoversImage(snapshot.anchorImageId);
        await tick();

        if (gridElement) {
            galleryLayout = computeGalleryLayout(getGridMetrics(gridElement));
            scrollToAnchorImage(snapshot.anchorImageId, snapshot.scrollY);
        } else {
            requestAnimationFrame(() => {
                window.scrollTo({ top: snapshot.scrollY, behavior: "auto" });
            });
        }
    }

    function handleHistoryPopState(event: PopStateEvent) {
        if (activeOverlay) {
            closeOverlayFromHistory();
            return;
        }
        if (!isSearchHistoryState(event.state)) return;

        switch (event.state.kind) {
            case "overlay":
                activeOverlay = event.state.overlay;
                setOverlayOpen(event.state.overlay, true);
                return;
            case "baseline":
                currentHistoryId = "";
                pendingHistoryAnchorId = "";
                searchFilter.set("");
                currentAmount = initialAmount;
                reconnectSearch();
                return;
            case "search":
                void restoreSearchSnapshot(event.state.snapshot);
                return;
            default: {
                const _exhaustive: never = event.state;
                return _exhaustive;
            }
        }
    }

    function applySearchViewReset() {
        scrollToTop();
        currentAmount = initialAmount;
        pendingHistoryAnchorId = "";
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
            refreshVisibleTiles();
            maybeAutoLoadMore();
            replaceCurrentSearchHistory();
        });
    }

    function hasMoreImagesToLoad() {
        const visibleStoreCount = quickTagActive
            ? $imageStore.filter((image) => !quickTagHiddenIds.has(image.id)).length
            : $imageStore.length;
        return (
            currentAmount < visibleStoreCount ||
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
        scheduleSearchCommit();
        clearTimeout(inputSearchTimer);
        inputSearchTimer = setTimeout(reconnectSearch, 100);
    }

    function selectChange() {
        scheduleSearchCommit();
        reconnectSearch();
    }

    function reconnectSearch() {
        syncTemporarySorting(buildSearchParams().search);
        streamAbort?.abort();
        streamAbort = undefined;
        searchSessionId = "";
        masonryColumnOrder = null;
        fetchingNextPage = false;
        const sessionId = ++updateSessionId;
        connectImageStream(sessionId);
    }

    function hasActiveSearchStream(): boolean {
        return searchSessionId !== "" || !searchCountComplete || streamAbort !== undefined;
    }

    function reconnectImageStream() {
        if (searchCountComplete && searchSessionId) {
            streamAbort?.abort();
            streamAbort = undefined;
            connectImageStream(updateSessionId, searchSessionId);
            return;
        }
        reconnectSearch();
    }

    function scheduleStreamRecovery() {
        if (!hasActiveSearchStream()) return;
        clearTimeout(streamRecoveryTimer);
        streamRecoveryTimer = setTimeout(() => {
            streamRecoveryTimer = undefined;
            if (!hasActiveSearchStream()) return;
            reconnectImageStream();
        }, STREAM_RECOVERY_DEBOUNCE_MS);
    }

    function handleVisibilityRecovery() {
        if (document.visibilityState === "hidden") {
            pageWasHidden = true;
            return;
        }
        if (!pageWasHidden) return;
        pageWasHidden = false;
        scheduleStreamRecovery();
    }

    function handlePageShowRecovery(event: PageTransitionEvent) {
        if (!event.persisted) return;
        scheduleStreamRecovery();
    }

    function handleOnlineRecovery() {
        scheduleStreamRecovery();
    }

    function syncTemporarySorting(search: string) {
        const result = syncTemporarySorts(sorting, temporarySortState, {
            hasSimilarity: hasSimilaritySearchParts(search),
            hasUniqueness: hasMmrSearchParts(search),
        });
        sorting = result.sorting;
        temporarySortState = result.state;
    }

    function isSessionUnavailable(cause: unknown): boolean {
        return cause instanceof Error
            && /session (?:not found|expired)/i.test(cause.message);
    }

    function exitQuickTagAfterSessionLoss() {
        searchSessionId = "";
        if (!quickTagActive) return;
        resetQuickTagState();
        notify(
            "Quick tag ended because its search session is no longer available. Recent tag changes remain, but undo and revert are unavailable.",
            "warn",
        );
    }

    function maybeNotifyImgSimSearchError(error: string | undefined, search: string) {
        if (!error) {
            lastImgSimSearchNotifyKey = "";
            return;
        }
        const key = `${search}\0${error}`;
        if (key === lastImgSimSearchNotifyKey) return;
        lastImgSimSearchNotifyKey = key;
        notify(error, "warn");
    }

    function maybeNotifyMmrSearchError(error: string | undefined, search: string) {
        if (!error) {
            lastMmrSearchNotifyKey = "";
            return;
        }
        const key = `${search}\0${error}`;
        if (key === lastMmrSearchNotifyKey) return;
        lastMmrSearchNotifyKey = key;
        notify(error, "warn");
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

    function hideQuickTagImage(id: string) {
        quickTagHiddenIds = new Set([...quickTagHiddenIds, id]);
    }

    function showQuickTagImage(id: string) {
        const next = new Set(quickTagHiddenIds);
        next.delete(id);
        quickTagHiddenIds = next;
    }

    function appendUniqueImages(existing: ClientImage[], additions: ClientImage[]): ClientImage[] {
        const ids = new Set(existing.map((image) => image.id));
        const unique = additions.filter((image) => {
            if (ids.has(image.id))
                return false;
            ids.add(image.id);
            return true;
        });
        return unique.length ? existing.concat(unique) : existing;
    }

    function connectImageStream(
        expectedSessionId: number,
        resumeSessionId?: string,
    ) {
        const abort = new AbortController();
        streamAbort = abort;
        const search = buildSearchParams();
        let hasReceivedImages = false;

        subscribeImageStream(
            {
                ...search,
                sorting,
                ...(resumeSessionId ? { sessionId: resumeSessionId } : {}),
            },
            {
                onInit: (init) => {
                    if (expectedSessionId !== updateSessionId) return;
                    const continuingSession =
                        resumeSessionId !== undefined
                        || (searchSessionId !== "" && init.sessionId === searchSessionId);
                    searchSessionId = init.sessionId;
                    if (!continuingSession) {
                        searchCountComplete = false;
                    }
                },
                onChunk: (chunk) => {
                    if (expectedSessionId !== updateSessionId) return;
                    imageAmountStore.set(chunk.matched);
                    const mapped = expandClientImages(chunk.images);
                    if (!mapped.length) return;

                    if (!hasReceivedImages) {
                        hasReceivedImages = true;
                        if (resumeSessionId) {
                            // History restore already filled the store; merge instead of replacing.
                            imageStore.update((x) => appendUniqueImages(x, mapped));
                        } else {
                            applySearchViewReset();
                            imageStore.set(mapped);
                        }
                        if (currentHistoryId) {
                            galleryCache.set(currentHistoryId, get(imageStore));
                        }
                        return;
                    }

                    imageStore.update((x) => appendUniqueImages(x, mapped));
                    if (currentHistoryId) {
                        galleryCache.set(currentHistoryId, get(imageStore));
                    }
                },
                onReady: (ready) => {
                    if (expectedSessionId !== updateSessionId) return;
                    imageAmountStore.set(ready.amount);
                    searchCountComplete = true;
                    maybeNotifyImgSearchError(ready.imgSearchError, search.search);
                    maybeNotifyImgSimSearchError(ready.imgsimSearchError, search.search);
                    maybeNotifyMmrSearchError(ready.mmrSearchError, search.search);
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
            if (resumeSessionId && isSessionUnavailable(err)) {
                reconnectSearch();
                return;
            }
            setTimeout(() => {
                if (abort.signal.aborted || expectedSessionId !== updateSessionId) return;
                reconnectImageStream();
            }, 2000);
        });
    }

    async function fetchNext() {
        const visibleImages = quickTagActive
            ? $imageStore.filter((image) => !quickTagHiddenIds.has(image.id))
            : $imageStore;
        if (visibleImages.length === 0) return;
        if (!searchSessionId) return;
        if (fetchingNextPage) return;
        const sessionId = searchSessionId;
        const lastImage = visibleImages[visibleImages.length - 1];

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
                images.images.filter((image) =>
                    !existingIds.has(image.id) && !quickTagHiddenIds.has(image.id),
                ),
            );
            if (!mapped.length) return;
            imageStore.update((x) => appendUniqueImages(x, mapped));
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

        if (!res.additions.length && !res.orderedIds) {
            if (!res.deletions.length) return;
            const nothingToDelete = !res.deletions.some((x) =>
                $imageStore.some((z) => z.id === x),
            );
            if (nothingToDelete) return;
        }

        const mapped = expandClientImages(res.additions);
        const deletionIds = new Set(res.deletions);
        const historyPositions = new Map(
            quickTagHistory.map((entry) => [entry.imageId, entry.position]),
        );
        const preservedIds = quickTagActive ? quickTagHiddenIds : new Set<string>();
        let additions = 0;
        let deletions = 0;

        imageStore.update((x) => {
            const modified = x.filter(
                (z) => !deletionIds.has(z.id) || preservedIds.has(z.id),
            );
            deletions = x.length - modified.length;
            const beforeAdditions = modified.length;
            const combined = appendUniqueImages(modified, mapped);
            additions = combined.length - beforeAdditions;
            if (!res.orderedIds) return combined;

            const positions = new Map(
                res.orderedIds.map((id, index) => [id, index]),
            );
            const hidden = combined
                .filter((image) => preservedIds.has(image.id))
                .sort((a, b) => {
                    const positionA = historyPositions.get(a.id) ?? Number.POSITIVE_INFINITY;
                    const positionB = historyPositions.get(b.id) ?? Number.POSITIVE_INFINITY;
                    return positionA - positionB;
                });
            const ordered = combined
                .filter((image) => !preservedIds.has(image.id))
                .sort((a, b) => {
                    const positionA = positions.get(a.id) ?? Number.POSITIVE_INFINITY;
                    const positionB = positions.get(b.id) ?? Number.POSITIVE_INFINITY;
                    return positionA - positionB;
                });
            for (const image of hidden) {
                const position = historyPositions.get(image.id) ?? ordered.length;
                ordered.splice(Math.min(position, ordered.length), 0, image);
            }
            return ordered;
        });

        imageAmountStore.set(
            res.orderedIds?.length
                ?? $imageAmountStore + additions - deletions,
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
            closeOverlay("quick-tag-setup");
            return;
        }
        if (e.key === "Escape" && quickTagActive) {
            closeOverlay("quick-tag");
            return;
        }
        if (e.key === "Escape" && selecting) {
            closeOverlay("selection");
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
                        openOverlay("selection");
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
                        if ($selection.length === 0) cancelSelect();
                    },
                },
                {
                    name: "Open folder",
                    visible: !selecting,
                    handler: () => openFolder(id),
                },
                {
                    name: "Similar prompts",
                    visible: !selecting,
                    handler() {
                        explorationMode.set('none');
                        searchFilter.set(`SIMILAR ${id} ${$similarityThreshold}`);
                        commitSearchNow();
                    },
                },
                {
                    name: "Similar images",
                    visible: (!selecting || $selection.length > 0) && isEmbeddingConfigured($embeddingStore),
                    handler() {
                        explorationMode.set('none');
                        const threshold = $embeddingStore.imageSimilarityThreshold;
                        const ids = selecting ? [...$selection] : [id];
                        if (ids.length > 1) {
                            searchFilter.set(`IMG avg ${ids.join(' ')} ${threshold}`);
                        } else {
                            searchFilter.set(`IMG ${ids[0]} ${threshold}`);
                        }
                        if (selecting)
                            cancelSelect();
                        commitSearchNow();
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
                        commitSearchNow();
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

    function tagAddedInvalidatesCurrentSearch(tag: string): boolean {
        for (const clause of tokenizeSearchClauses($searchFilter)) {
            const text = clause.text.trim();
            if (!/\bNOT\b/i.test(text) || !/\bTAG\b/i.test(text))
                continue;

            const raw = text.replace(/^.*?\bTAG\s+/i, '').trim();
            if (!raw)
                continue;
            if (isExactTagTerm(raw) && raw === tag)
                return true;

            try {
                if (new RegExp(raw, 'is').test(tag))
                    return true;
            } catch {
                // Malformed searches are handled by the normal search flow.
            }
        }
        return false;
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
            handler: () => {
                const actionIds = selecting ? [...$selection] : id ? [id] : [];
                if (!actionIds.length)
                    return;
                if (type === "move")
                    removeImagesFromUI(actionIds);
                void imageAction(actionIds, {
                    type,
                    folder,
                });
            },
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
                    const updatedIds: string[] = [];
                    await Promise.all(ids.map(async (imageId, index) => {
                        const current = tagsByImage[index] ?? [];
                        if (current.includes(tag))
                            return;
                        await updateImageTags(imageId, [...current, tag]);
                        updatedIds.push(imageId);
                    }));
                    if (tagAddedInvalidatesCurrentSearch(tag))
                        removeImagesFromUI(updatedIds);
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

                if ($selection.length === 0) cancelSelect();
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
        closeOverlay("selection");
        if (activeOverlay !== "selection") selection.deselectAll();
    }

    function openFolder(id: string) {
        imageAction(id, { type: "open" });
    }

    function openBulk() {
        syncSearchInput(inputElement);
        bulkSearchParams = buildSearchParams();
        openOverlay("bulk");
    }

    function handleBulkComplete(refresh?: boolean) {
        if (refresh) {
            reconnectSearch();
        }
    }

    function openQuickTagSetup() {
        closeNavMenu();
        openOverlay("quick-tag-setup");
    }

    function closeQuickTagSetup() {
        closeOverlay("quick-tag-setup");
    }

    function startQuickTag(event: CustomEvent<{ mode: BulkTagMode }>) {
        quickTagMode = event.detail.mode;
        quickTagHistory = [];
        quickTagHiddenIds = new Set();
        quickTagLastClickAt = 0;
        quickTagInFlight.clear();
        quickTagSetupOpen = false;
        activeOverlay = "quick-tag";
        history.replaceState(
            { kind: "overlay", searchHistory: true, overlay: "quick-tag" } satisfies SearchHistoryState,
            "",
        );
        quickTagActive = true;
        closeImage();
        cancelSelect();
    }

    function resetQuickTagState() {
        quickTagActive = false;
        quickTagSetupOpen = false;
        quickTagHistory = [];
        quickTagHiddenIds = new Set();
        quickTagLastClickAt = 0;
        quickTagInFlight.clear();
    }

    async function undoQuickTag() {
        const entry = quickTagHistory.at(-1);
        if (!entry) return;

        try {
            await updateImageTags(entry.imageId, entry.originalTags);
            quickTagHistory = quickTagHistory.slice(0, -1);
            showQuickTagImage(entry.imageId);
            await scrollGalleryImageIntoView(entry.imageId);
        } catch (cause) {
            console.error(cause);
            if (isSessionUnavailable(cause)) {
                exitQuickTagAfterSessionLoss();
                return;
            }
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
            closeOverlay("quick-tag");
        } catch (cause) {
            console.error(cause);
            if (isSessionUnavailable(cause)) {
                exitQuickTagAfterSessionLoss();
                return;
            }
            notify(cause instanceof Error ? cause.message : "Revert failed", "warn");
        }
    }

    function doneQuickTag() {
        const taggedIds = new Set(quickTagHistory.map((entry) => entry.imageId));
        if (taggedIds.size) {
            imageStore.update((images) => images.filter((image) => !taggedIds.has(image.id)));
        }
        closeOverlay("quick-tag");
    }

    async function handleQuickTagImage(img: ClientImage, e?: MouseEvent | KeyboardEvent) {
        if (e && e instanceof MouseEvent && e.button !== 0) return;
        if (!quickTagSelectedTags.length) {
            notify("Select at least one tag", "warn");
            return;
        }
        if (quickTagHiddenIds.has(img.id) || quickTagInFlight.has(img.id)) return;

        const now = Date.now();
        if (now - quickTagLastClickAt < QUICK_TAG_COOLDOWN_MS) return;

        quickTagLastClickAt = now;
        hideQuickTagImage(img.id);
        quickTagInFlight.add(img.id);
        const position = $imageStore.findIndex((image) => image.id === img.id);
        let originalTags: string[] | undefined;

        try {
            originalTags = await fetchImageTags(img.id);
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
                    position,
                },
            ];
        } catch (cause) {
            console.error(cause);
            if (originalTags) {
                await updateImageTags(img.id, originalTags).catch(console.error);
            }
            quickTagHistory = quickTagHistory.filter((entry) => entry.imageId !== img.id);
            showQuickTagImage(img.id);
            if (isSessionUnavailable(cause)) {
                exitQuickTagAfterSessionLoss();
                return;
            }
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
            Images: {viewportImageIndex} /
            <span class:pending={!searchCountComplete}>{$imageAmountStore}</span>
        </span>

        <Select
            id="sorting"
            prefix="Sorting"
            bind:value={sorting}
            options={sortingOptions}
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
                            openOverlay("selection");
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
        {#each visibleTiles as tile (tile.id)}
            {@const img = galleryImageById.get(tile.id)}
            {#if img}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <div
                    id={`img_${img.id}`}
                    class="gallery-tile"
                    class:selecting
                    style={`top:${tile.top}px;left:${tile.left}px;width:${tile.width}px;height:${tile.height}px`}
                    on:click={selectImg(img.id)}
                >
                    <ImageDisplay
                        {img}
                        loadSession={scrollLoadSession}
                        shimmerIndex={paginatedIndexById.get(img.id) ?? 0}
                        selected={selecting &&
                            $selection.includes(img.id)}
                        onClick={quickTagActive
                            ? ((e) => handleQuickTagImage(img, e))
                            : !selecting && ((e) => openImage(img, e))}
                        onContext={handleImgContext(img.id)}
                        onLoaded={handleImageLoaded}
                    />
                </div>
            {/if}
        {/each}
    </div>
</div>

<div class="loader">
    {#if fetchingNextPage}
        <div><p>loading...</p></div>
    {:else if galleryImages.length === $imageAmountStore}
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
        on:close={() => closeOverlay("bulk")}
        onComplete={handleBulkComplete}
    />
{/if}

{#if quickTagSetupOpen}
    <QuickTagSetupModal
        bind:tagMode={quickTagMode}
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
        --gallery-gap: 0.8em;
        padding: calc(var(--main-padding) / 2) var(--main-padding);
        min-height: 100vh;
        overflow-anchor: none;
        position: relative;

        .grid-content {
            position: relative;
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: var(--gallery-gap);
            height: var(--gallery-height, 0px);
            opacity: 1;
            visibility: visible;
        }

        .gallery-tile {
            position: absolute;
            box-sizing: border-box;
            overflow-anchor: none;

            :global(.base) {
                width: 100%;
                height: 100%;
            }
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

        &.spacing-compact {
            --gallery-gap: 2px;
            padding: 5px;
        }

        &.spacing-mosaic {
            --gallery-gap: 0px;
            padding: 0;
        }

        @media (width > 1200px) {
            .masonry-probe {
                width: calc(250px + var(--size-offset));
            }
        }

        @media (width < 501px) {
            --gallery-gap: 0.2em;
            padding: 5px;

            .masonry-probe {
                width: calc(130px + var(--size-offset));
            }

            &.spacing-compact {
                --gallery-gap: 2px;
                padding: 5px;
            }

            &.spacing-mosaic {
                --gallery-gap: 0px;
                padding: 0;
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
