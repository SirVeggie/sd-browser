export type ScrollAnchor = {
    id: string;
    viewportTop: number;
};

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
