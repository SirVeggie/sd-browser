import type { ClientImage } from "$lib/types/images";

const FALLBACK_ITEM_HEIGHT = 320;

export function computeColumnCount(
    containerWidth: number,
    minColumnWidth: number,
    gap: number,
): number {
    if (containerWidth <= 0) return 1;
    return Math.max(
        1,
        Math.floor((containerWidth + gap) / (minColumnWidth + gap)),
    );
}

export function computeColumnWidth(
    containerWidth: number,
    columnCount: number,
    gap: number,
): number {
    if (columnCount <= 1) return containerWidth;
    return (containerWidth - gap * (columnCount - 1)) / columnCount;
}

export function estimateContentHeight(
    img: ClientImage,
    columnWidth: number,
): number {
    if (img.width && img.height && img.width > 0) {
        return columnWidth * (img.height / img.width);
    }
    return FALLBACK_ITEM_HEIGHT;
}

export function estimateItemHeight(
    img: ClientImage,
    columnWidth: number,
    itemGap: number,
): number {
    return estimateContentHeight(img, columnWidth) + itemGap;
}

export type MasonryColumn = {
    key: number;
    items: ClientImage[];
};

export type MasonryMetrics = {
    columnCount: number;
    columnWidth: number;
    gap: number;
};

export function getGridMetrics(container: HTMLElement): MasonryMetrics {
    const probe = container.querySelector(".masonry-probe") as HTMLElement | null;
    const content = container.querySelector(".grid-content") as HTMLElement | null;
    const contentStyles = getComputedStyle(content ?? container);
    const containerStyles = getComputedStyle(container);
    // Prefer computed gap (px) from the content box; fall back to --gallery-gap.
    const gapFromComputed =
        parseFloat(contentStyles.gap) || parseFloat(contentStyles.columnGap) || 0;
    const gapFromVar = parseFloat(
        containerStyles.getPropertyValue("--gallery-gap"),
    );
    const gap =
        gapFromComputed ||
        (Number.isFinite(gapFromVar) ? gapFromVar : 0) ||
        0;
    const padding =
        parseFloat(containerStyles.paddingLeft) +
        parseFloat(containerStyles.paddingRight);
    const innerWidth = container.clientWidth - padding;
    const minColumnWidth = probe?.offsetWidth ?? innerWidth;
    const columnCount = computeColumnCount(innerWidth, minColumnWidth, gap);
    const columnWidth = computeColumnWidth(innerWidth, columnCount, gap);

    return { columnCount, columnWidth, gap };
}

/** @deprecated Use getGridMetrics */
export const getMasonryMetrics = getGridMetrics;

export const RESIZE_LAYOUT_DEBOUNCE_MS = 150;
export const RESIZE_DEBOUNCE_IMAGE_THRESHOLD = 1500;
export const AUTOLOAD_SUPPRESS_AFTER_LAYOUT_MS = 400;

/** First index where previous and next id sequences diverge. */
export function computeDirtyIndex(prevIds: string[], nextIds: string[]): number {
    const minLen = Math.min(prevIds.length, nextIds.length);
    for (let i = 0; i < minLen; i++) {
        if (prevIds[i] !== nextIds[i]) {
            return i;
        }
    }
    return minLen;
}

export class MasonryPlacer {
    private listKey = "";
    private columnCount = 0;
    private prevIds: string[] = [];
    private assignments = new Map<string, number>();
    private columnHeights: number[] = [];

    reset(listKey = "") {
        this.listKey = listKey;
        this.columnCount = 0;
        this.prevIds = [];
        this.assignments.clear();
        this.columnHeights = [];
    }

    getAssignment(id: string): number | undefined {
        return this.assignments.get(id);
    }

    layout(
        images: ClientImage[],
        listKey: string,
        metrics: MasonryMetrics,
    ): MasonryColumn[] {
        if (listKey !== this.listKey) {
            this.reset(listKey);
        }

        const { columnCount, columnWidth, gap } = metrics;
        const nextIds = images.map((img) => img.id);
        const imageIds = new Set(nextIds);

        for (const id of [...this.assignments.keys()]) {
            if (!imageIds.has(id)) {
                this.assignments.delete(id);
            }
        }

        const dirtyIndex = computeDirtyIndex(this.prevIds, nextIds);
        const needsFullReflow =
            columnCount !== this.columnCount ||
            this.assignments.size === 0 ||
            dirtyIndex === 0;

        if (needsFullReflow) {
            this.reflow(images, metrics);
        } else if (dirtyIndex < images.length) {
            this.reflowFrom(images, dirtyIndex, metrics);
        }

        this.columnCount = columnCount;
        this.prevIds = nextIds;
        return this.buildColumns(images, columnCount);
    }

    private reflow(images: ClientImage[], metrics: MasonryMetrics) {
        const { columnCount, columnWidth, gap } = metrics;
        this.assignments.clear();
        this.columnHeights = Array.from({ length: columnCount }, () => 0);

        let placementIndex = 0;
        for (const img of images) {
            const forcedColumn =
                placementIndex < columnCount ? placementIndex : undefined;
            this.place(img, columnWidth, gap, forcedColumn);
            placementIndex++;
        }
    }

    private reflowFrom(
        images: ClientImage[],
        dirtyIndex: number,
        metrics: MasonryMetrics,
    ) {
        const { columnCount, columnWidth, gap } = metrics;

        for (let i = dirtyIndex; i < images.length; i++) {
            this.assignments.delete(images[i].id);
        }

        this.rebuildColumnHeights(images, columnWidth, gap);

        let placementIndex = dirtyIndex;
        for (let i = dirtyIndex; i < images.length; i++) {
            const img = images[i];
            const forcedColumn =
                placementIndex < columnCount ? placementIndex : undefined;
            this.place(img, columnWidth, gap, forcedColumn);
            placementIndex++;
        }
    }

    private rebuildColumnHeights(
        images: ClientImage[],
        columnWidth: number,
        gap: number,
    ) {
        this.columnHeights = Array.from(
            { length: this.columnCount },
            () => 0,
        );
        for (const image of images) {
            const column = this.assignments.get(image.id);
            if (column === undefined) continue;
            this.columnHeights[column] += estimateItemHeight(image, columnWidth, gap);
        }
    }

    private place(
        img: ClientImage,
        columnWidth: number,
        gap: number,
        forcedColumn?: number,
    ) {
        const height = estimateItemHeight(img, columnWidth, gap);
        const column = forcedColumn ?? this.shortestColumn();

        this.assignments.set(img.id, column);
        this.columnHeights[column] += height;
    }

    private shortestColumn(): number {
        let column = 0;
        for (let i = 1; i < this.columnHeights.length; i++) {
            if (this.columnHeights[i] < this.columnHeights[column]) {
                column = i;
            }
        }
        return column;
    }

    private buildColumns(
        images: ClientImage[],
        columnCount: number,
    ): MasonryColumn[] {
        const buckets: ClientImage[][] = Array.from(
            { length: columnCount },
            () => [],
        );

        for (const img of images) {
            const column = this.assignments.get(img.id);
            if (column === undefined) continue;
            buckets[column].push(img);
        }

        return buckets.map((items, key) => ({ key, items }));
    }
}

function firstItemSortIndex(
    column: MasonryColumn,
    itemIndex: Map<string, number>,
): number {
    const first = column.items[0];
    if (!first) return Number.POSITIVE_INFINITY;
    return itemIndex.get(first.id) ?? Number.POSITIVE_INFINITY;
}

/** Order columns left-to-right by list index of each column's first item. */
export function sortColumnsByFirstItemIndex(
    columns: MasonryColumn[],
    itemIndex: Map<string, number>,
): MasonryColumn[] {
    return [...columns].sort((a, b) => {
        const byIndex =
            firstItemSortIndex(a, itemIndex) - firstItemSortIndex(b, itemIndex);
        return byIndex !== 0 ? byIndex : a.key - b.key;
    });
}

/** Preserve a previously chosen left-to-right column order after placer updates. */
export function applyColumnOrder(
    columns: MasonryColumn[],
    order: number[],
): MasonryColumn[] {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const ordered: MasonryColumn[] = [];
    const used = new Set<number>();

    for (const key of order) {
        const column = byKey.get(key);
        if (!column) continue;
        ordered.push(column);
        used.add(key);
    }

    for (const column of columns) {
        if (!used.has(column.key)) ordered.push(column);
    }

    return ordered;
}
