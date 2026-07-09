export const SCROLL_LOAD_BUFFER_VH = 400;
export const AUTO_LOAD_DEBOUNCE_MS = 100;

export function getDistanceFromBottom(): number {
    const doc = document.documentElement;
    return doc.scrollHeight - (window.scrollY + window.innerHeight);
}

export function getScrollLoadBufferPx(
    bufferVh = SCROLL_LOAD_BUFFER_VH,
): number {
    return (window.innerHeight * bufferVh) / 100;
}

export function isNearBottom(bufferVh = SCROLL_LOAD_BUFFER_VH): boolean {
    return getDistanceFromBottom() <= getScrollLoadBufferPx(bufferVh);
}

export const NEAR_TOP_THRESHOLD_PX = 200;

export function isNearTop(thresholdPx = NEAR_TOP_THRESHOLD_PX): boolean {
    return window.scrollY <= thresholdPx;
}
