export type ScrollAnchor = {
    id: string;
    viewportTop: number;
};

export type ScrollAnchorLayout = {
    id: string;
    top: number;
    height: number;
};

/** Pick the tile whose vertical center is closest to the viewport center. */
export function findNearestViewportLayout(
    layouts: ScrollAnchorLayout[],
    gridTopInViewport: number,
): ScrollAnchorLayout | null {
    if (layouts.length === 0) return null;

    const viewportCenter = window.innerHeight / 2;
    let best: ScrollAnchorLayout | null = null;
    let bestDistance = Infinity;

    for (const layout of layouts) {
        const itemCenter = gridTopInViewport + layout.top + layout.height / 2;
        const distance = Math.abs(itemCenter - viewportCenter);
        if (distance >= bestDistance) continue;

        bestDistance = distance;
        best = layout;
    }

    return best;
}

export function captureScrollAnchorFromLayouts(
    layouts: ScrollAnchorLayout[],
    gridTopInViewport: number,
): ScrollAnchor | null {
    const nearest = findNearestViewportLayout(layouts, gridTopInViewport);
    if (!nearest) return null;

    return {
        id: `img_${nearest.id}`,
        viewportTop: gridTopInViewport + nearest.top,
    };
}

export function captureScrollAnchor(root: HTMLElement): ScrollAnchor | null {
    const items = root.querySelectorAll<HTMLElement>('[id^="img_"]');
    if (items.length === 0) return null;

    const viewportCenter = window.innerHeight / 2;
    let best: ScrollAnchor | null = null;
    let bestDistance = Infinity;

    for (const item of items) {
        const rect = item.getBoundingClientRect();
        const itemCenter = rect.top + rect.height / 2;
        const distance = Math.abs(itemCenter - viewportCenter);
        if (distance >= bestDistance) continue;

        bestDistance = distance;
        best = {
            id: item.id,
            viewportTop: rect.top,
        };
    }

    return best;
}

export function restoreScrollAnchor(anchor: ScrollAnchor): boolean {
    const element = document.getElementById(anchor.id);
    if (!element) return false;

    const delta = element.getBoundingClientRect().top - anchor.viewportTop;
    if (Math.abs(delta) < 0.5) return true;

    window.scrollBy(0, delta);
    return true;
}

/** Restore scroll using layout coordinates when the tile may be unmounted. */
export function restoreScrollAnchorFromLayout(
    anchor: ScrollAnchor,
    layout: ScrollAnchorLayout | undefined,
    grid: HTMLElement,
): boolean {
    if (!layout) return restoreScrollAnchor(anchor);

    const gridTop = grid.getBoundingClientRect().top;
    const currentTop = gridTop + layout.top;
    const delta = currentTop - anchor.viewportTop;
    if (Math.abs(delta) < 0.5) return true;

    window.scrollBy(0, delta);
    return true;
}

export function scrollLayoutIntoView(
    layout: ScrollAnchorLayout,
    grid: HTMLElement,
    block: ScrollLogicalPosition = "center",
): void {
    const gridDocTop = window.scrollY + grid.getBoundingClientRect().top;
    const absoluteTop = gridDocTop + layout.top;

    let target: number;
    if (block === "start") {
        target = absoluteTop;
    } else if (block === "end") {
        target = absoluteTop + layout.height - window.innerHeight;
    } else if (block === "nearest") {
        const viewTop = window.scrollY;
        const viewBottom = viewTop + window.innerHeight;
        const itemBottom = absoluteTop + layout.height;
        if (absoluteTop >= viewTop && itemBottom <= viewBottom) {
            return;
        }
        target =
            absoluteTop < viewTop
                ? absoluteTop
                : itemBottom - window.innerHeight;
    } else if (block === "center") {
        target = absoluteTop - window.innerHeight / 2 + layout.height / 2;
    } else {
        const _exhaustive: never = block;
        void _exhaustive;
        target = absoluteTop - window.innerHeight / 2 + layout.height / 2;
    }

    window.scrollTo({ top: Math.max(0, target), behavior: "auto" });
}
