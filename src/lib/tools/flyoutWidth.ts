export const FLYOUT_CUSTOM_MAX_VW = 0.8;
export const FLYOUT_CUSTOM_MIN_PX = 280;
export const FLYOUT_CUSTOM_DEFAULT_PX = 500;

export function flyoutCustomMaxPx(viewportWidth: number): number {
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0)
        return FLYOUT_CUSTOM_DEFAULT_PX;
    return viewportWidth * FLYOUT_CUSTOM_MAX_VW;
}

export function resolvedFlyoutCustomWidth(savedPx: number | undefined): number {
    if (typeof savedPx === 'number' && Number.isFinite(savedPx) && savedPx > 0)
        return savedPx;
    return FLYOUT_CUSTOM_DEFAULT_PX;
}

/** Display / drag width: saved px, clamped to [min, 80vw of the current viewport]. */
export function clampFlyoutCustomWidth(px: number, viewportWidth: number): number {
    const maxPx = flyoutCustomMaxPx(viewportWidth);
    const minPx = Math.min(FLYOUT_CUSTOM_MIN_PX, maxPx);
    const value = Number.isFinite(px) && px > 0 ? px : FLYOUT_CUSTOM_DEFAULT_PX;
    return Math.min(Math.max(value, minPx), maxPx);
}

/**
 * Window resize never writes saved px. Skip persist when the drag is still
 * hard against the 80vw cap and the remembered width is larger than that cap.
 */
export function shouldPersistFlyoutCustomWidth(
    savedPx: number | undefined,
    nextPx: number,
    viewportWidth: number,
): boolean {
    if (!Number.isFinite(nextPx) || nextPx <= 0)
        return false;
    const maxPx = flyoutCustomMaxPx(viewportWidth);
    const saved = resolvedFlyoutCustomWidth(savedPx);
    if (saved > maxPx && nextPx >= maxPx - 0.5)
        return false;
    return true;
}

export function readCurrentFlyoutWidthPx(): number | undefined {
    if (typeof document === 'undefined')
        return undefined;
    const el = document.querySelector('.flyout');
    if (!(el instanceof HTMLElement))
        return undefined;
    const width = el.getBoundingClientRect().width;
    if (!Number.isFinite(width) || width <= 0)
        return undefined;
    return Math.round(width);
}
