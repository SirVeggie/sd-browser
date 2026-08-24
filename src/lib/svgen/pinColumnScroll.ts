/** Nearest Generate-panel column scroll root. */
export function columnScrollRoot(from: EventTarget | null): HTMLElement | null {
    if (!(from instanceof Element))
        return null;
    return from.closest('[data-overlay-scroll]');
}

/**
 * Capture column `scrollTop` and restore after focus/layout/keyboard churn.
 *
 * Mobile browsers often shift nested `overflow` containers when a focused text
 * field blurs (soft keyboard) or when a control takes focus — even if the
 * control called `preventDefault` on `pointerdown`.
 */
export function pinColumnScroll(from: EventTarget | null): void {
    const root = columnScrollRoot(from);
    if (!root)
        return;
    const top = root.scrollTop;
    const restore = () => {
        if (root.scrollTop !== top)
            root.scrollTop = top;
    };
    queueMicrotask(restore);
    requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
    });
    // Keyboard / visualViewport adjustments can land a beat later.
    window.setTimeout(restore, 50);
    window.setTimeout(restore, 150);
}
