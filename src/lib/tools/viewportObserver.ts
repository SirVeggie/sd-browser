const VIEWPORT_MARGIN_VH = 250;

type VisibilityCallback = (visible: boolean) => void;

let observer: IntersectionObserver | undefined;
const callbacks = new Map<Element, VisibilityCallback>();

function getRootMargin(): string {
    const marginPx = (window.innerHeight * VIEWPORT_MARGIN_VH) / 100;
    return `${marginPx}px 0px ${marginPx}px 0px`;
}

function ensureObserver() {
    if (observer) return;
    observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                callbacks.get(entry.target)?.(entry.isIntersecting);
            }
        },
        { root: null, rootMargin: getRootMargin(), threshold: 0 },
    );
}

export function observeViewport(
    node: Element,
    onVisible: VisibilityCallback,
): { destroy(): void } {
    ensureObserver();
    callbacks.set(node, onVisible);
    observer!.observe(node);

    return {
        destroy() {
            observer?.unobserve(node);
            callbacks.delete(node);
            if (callbacks.size === 0) {
                observer?.disconnect();
                observer = undefined;
            }
        },
    };
}
