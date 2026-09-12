export const MULTILINE_MAX_LINES = 12;

export type AutosizeBoxMetrics = {
    lineHeight: number;
    fontSize: number;
    paddingY: number;
    borderY: number;
};

export type AutosizeResult = {
    height: number;
    overflowY: 'auto' | 'hidden';
};

/** Skip until the box has a real wrap width; ignore height-only ResizeObserver noise. */
export function shouldRemeasureForWidth(previousWidth: number, nextWidth: number): boolean {
    return nextWidth > 0 && nextWidth !== previousWidth;
}

export function computeAutosizeHeight(
    scrollHeight: number,
    clientWidth: number,
    styles: AutosizeBoxMetrics,
    maxLines = MULTILINE_MAX_LINES,
): AutosizeResult | null {
    if (clientWidth <= 0)
        return null;
    const lineHeight = styles.lineHeight || styles.fontSize * 1.35;
    const maxHeight = lineHeight * maxLines + styles.paddingY + styles.borderY;
    return {
        height: Math.min(scrollHeight, maxHeight),
        overflowY: scrollHeight > maxHeight ? 'auto' : 'hidden',
    };
}

function boxMetrics(el: HTMLTextAreaElement): AutosizeBoxMetrics {
    const styles = getComputedStyle(el);
    return {
        lineHeight: Number.parseFloat(styles.lineHeight),
        fontSize: Number.parseFloat(styles.fontSize),
        paddingY: Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom),
        borderY: Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth),
    };
}

/** Returns false when the textarea is not laid out yet (clientWidth 0). */
export function autosizeTextarea(el: HTMLTextAreaElement): boolean {
    if (el.clientWidth <= 0)
        return false;
    el.style.height = 'auto';
    const result = computeAutosizeHeight(el.scrollHeight, el.clientWidth, boxMetrics(el));
    if (!result)
        return false;
    el.style.height = `${result.height}px`;
    el.style.overflowY = result.overflowY;
    return true;
}
