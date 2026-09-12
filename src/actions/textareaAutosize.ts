import { tick } from 'svelte';
import {
    autosizeTextarea,
    shouldRemeasureForWidth,
} from '../lib/svgen/textareaAutosize';

/**
 * Size a Generate-panel textarea to its content. Re-runs when wrap width
 * changes or webfonts finish loading — the first tick after refresh can
 * measure against a 0-width flyout or fallback font metrics.
 */
export function textareaAutosize(node: HTMLTextAreaElement, value: string) {
    let lastWidth = -1;
    let lastValue = value;
    let cancelled = false;
    let raf = 0;

    function remasure() {
        if (cancelled)
            return;
        if (!autosizeTextarea(node))
            return;
        lastWidth = node.clientWidth;
    }

    function remasureIfWidthChanged() {
        if (!shouldRemeasureForWidth(lastWidth, node.clientWidth))
            return;
        remasure();
    }

    const resizeObserver = new ResizeObserver(remasureIfWidthChanged);
    resizeObserver.observe(node);

    void tick().then(remasure);
    raf = requestAnimationFrame(remasure);
    const fontsReady = document.fonts?.ready;
    void fontsReady?.then(() => {
        if (!cancelled)
            remasure();
    });

    return {
        update(next: string) {
            if (next === lastValue)
                return;
            lastValue = next;
            void tick().then(remasure);
        },
        destroy() {
            cancelled = true;
            cancelAnimationFrame(raf);
            resizeObserver.disconnect();
        },
    };
}
