import type { ClientImage } from "$lib/types/images";
import {
    applyColumnOrder,
    estimateContentHeight,
    MasonryPlacer,
    sortColumnsByFirstItemIndex,
    type MasonryMetrics,
} from "./masonryLayout";

export type GalleryTile = {
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
};

export type GalleryLayout = {
    tiles: GalleryTile[];
    byId: Map<string, GalleryTile>;
    totalHeight: number;
};

/** Overscan above/below the viewport when choosing which tiles to mount. */
export const GALLERY_OVERSCAN_VH = 150;

export function getGalleryOverscanPx(
    overscanVh = GALLERY_OVERSCAN_VH,
): number {
    return (window.innerHeight * overscanVh) / 100;
}

function emptyLayout(): GalleryLayout {
    return { tiles: [], byId: new Map(), totalHeight: 0 };
}

function finishLayout(tiles: GalleryTile[], columnHeights: number[], gap: number): GalleryLayout {
    const byId = new Map<string, GalleryTile>();
    for (const tile of tiles) {
        byId.set(tile.id, tile);
    }

    let maxHeight = 0;
    for (const height of columnHeights) {
        if (height > maxHeight) maxHeight = height;
    }

    return {
        tiles,
        byId,
        totalHeight: maxHeight > 0 ? Math.max(0, maxHeight - gap) : 0,
    };
}

/** Row-major grid packing (CSS auto-fill visual model). */
export function layoutGridTiles(
    images: ClientImage[],
    metrics: MasonryMetrics,
): GalleryLayout {
    const { columnCount, columnWidth, gap } = metrics;
    if (images.length === 0 || columnCount < 1) return emptyLayout();

    const rowCount = Math.ceil(images.length / columnCount);
    const rowHeights = Array.from({ length: rowCount }, () => 0);
    const cells: { img: ClientImage; row: number; col: number; height: number }[] =
        [];

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const row = Math.floor(i / columnCount);
        const col = i % columnCount;
        const height = estimateContentHeight(img, columnWidth);
        cells.push({ img, row, col, height });
        if (height > rowHeights[row]) rowHeights[row] = height;
    }

    const rowTops = Array.from({ length: rowCount }, () => 0);
    let y = 0;
    for (let row = 0; row < rowCount; row++) {
        rowTops[row] = y;
        y += rowHeights[row] + gap;
    }

    const tiles: GalleryTile[] = cells.map((cell) => ({
        id: cell.img.id,
        left: cell.col * (columnWidth + gap),
        top: rowTops[cell.row],
        width: columnWidth,
        height: cell.height,
    }));

    const byId = new Map<string, GalleryTile>();
    for (const tile of tiles) {
        byId.set(tile.id, tile);
    }

    return {
        tiles,
        byId,
        totalHeight: rowCount > 0 ? Math.max(0, y - gap) : 0,
    };
}

export type MasonryGalleryLayout = {
    layout: GalleryLayout;
    columnOrder: number[];
};

/**
 * Shortest-column masonry positions from placer assignments.
 * `columnOrder` is the left-to-right visual order of placer column keys.
 */
export function layoutMasonryTiles(
    placer: MasonryPlacer,
    images: ClientImage[],
    listKey: string,
    metrics: MasonryMetrics,
    options: {
        columnOrder: number[] | null;
        itemIndex: Map<string, number>;
        nearTop: boolean;
    },
): MasonryGalleryLayout {
    const { columnCount, columnWidth, gap } = metrics;
    if (images.length === 0 || columnCount < 1) {
        return { layout: emptyLayout(), columnOrder: [] };
    }

    const columns = placer.layout(images, listKey, metrics);

    let columnOrder: number[];
    if (options.nearTop) {
        columnOrder = sortColumnsByFirstItemIndex(
            columns,
            options.itemIndex,
        ).map((column) => column.key);
    } else if (options.columnOrder && options.columnOrder.length > 0) {
        columnOrder = applyColumnOrder(columns, options.columnOrder).map(
            (column) => column.key,
        );
    } else {
        columnOrder = columns.map((column) => column.key);
    }

    const keyToVisual = new Map<number, number>();
    columnOrder.forEach((key, visualIndex) => {
        keyToVisual.set(key, visualIndex);
    });

    const columnHeights = Array.from({ length: columnCount }, () => 0);
    const tiles: GalleryTile[] = [];

    for (const img of images) {
        const columnKey = placer.getAssignment(img.id);
        if (columnKey === undefined) continue;

        const visualIndex = keyToVisual.get(columnKey) ?? columnKey;
        const height = estimateContentHeight(img, columnWidth);
        const top = columnHeights[columnKey];

        tiles.push({
            id: img.id,
            left: visualIndex * (columnWidth + gap),
            top,
            width: columnWidth,
            height,
        });

        columnHeights[columnKey] += height + gap;
    }

    return {
        layout: finishLayout(tiles, columnHeights, gap),
        columnOrder,
    };
}

/** Tiles whose bounds intersect [viewTop, viewBottom]. */
export function getVisibleTiles(
    tiles: GalleryTile[],
    viewTop: number,
    viewBottom: number,
): GalleryTile[] {
    if (tiles.length === 0 || viewBottom <= viewTop) return [];

    const visible: GalleryTile[] = [];
    for (const tile of tiles) {
        if (tile.top < viewBottom && tile.top + tile.height > viewTop) {
            visible.push(tile);
        }
    }
    return visible;
}

export function getVisibleTilesForGrid(
    grid: HTMLElement,
    tiles: GalleryTile[],
    overscanPx = getGalleryOverscanPx(),
): GalleryTile[] {
    const rect = grid.getBoundingClientRect();
    const viewTop = -rect.top - overscanPx;
    const viewBottom = -rect.top + window.innerHeight + overscanPx;
    return getVisibleTiles(tiles, viewTop, viewBottom);
}
