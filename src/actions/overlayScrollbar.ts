/**
 * Fade-on-idle overlay scrollbar (same idea as ImageFull).
 *
 * Use on a position:relative host. The scrollable child must have
 * `data-overlay-scroll`. Native scrollbars on that child are hidden.
 */
export type OverlayScrollbarParams = {
    /** ms after last scroll before fading toward idle opacity */
    fadeDelayMs?: number;
};

const DEFAULT_FADE_DELAY_MS = 900;

export function overlayScrollbar(host: HTMLElement, params: OverlayScrollbarParams = {}) {
    let fadeDelayMs = params.fadeDelayMs ?? DEFAULT_FADE_DELAY_MS;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeObserver: ResizeObserver | undefined;

    host.classList.add('overlay-scrollbar-host');

    const track = document.createElement('div');
    track.className = 'overlay-scrollbar-track';
    track.setAttribute('aria-hidden', 'true');
    const thumb = document.createElement('div');
    thumb.className = 'overlay-scrollbar-thumb';
    track.appendChild(thumb);
    host.appendChild(track);

    function scrollEl(): HTMLElement | null {
        return host.querySelector<HTMLElement>('[data-overlay-scroll]');
    }

    function clearFadeTimer() {
        if (!fadeTimer)
            return;
        clearTimeout(fadeTimer);
        fadeTimer = undefined;
    }

    function setActive(active: boolean) {
        track.classList.toggle('active', active);
    }

    function update() {
        const el = scrollEl();
        if (!el) {
            track.hidden = true;
            return;
        }

        const { scrollTop, scrollHeight, clientHeight } = el;
        const overflow = scrollHeight - clientHeight;
        if (overflow <= 1) {
            track.hidden = true;
            track.classList.remove('has-overflow');
            return;
        }

        track.hidden = false;
        track.classList.add('has-overflow');

        const trackHeight = clientHeight;
        const thumbHeight = Math.max(28, (clientHeight / scrollHeight) * trackHeight);
        const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
        const thumbTop = maxThumbTop === 0 ? 0 : (scrollTop / overflow) * maxThumbTop;
        thumb.style.height = `${thumbHeight}px`;
        thumb.style.transform = `translateY(${thumbTop}px)`;
    }

    function onScroll() {
        update();
        setActive(true);
        clearFadeTimer();
        fadeTimer = setTimeout(() => {
            setActive(false);
            fadeTimer = undefined;
        }, fadeDelayMs);
    }

    function bindScrollEl(el: HTMLElement) {
        el.classList.add('overlay-scrollbar-scroll');
        el.addEventListener('scroll', onScroll, { passive: true });
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(() => update());
        resizeObserver.observe(el);
        for (const child of el.children) {
            if (child instanceof HTMLElement)
                resizeObserver.observe(child);
        }
        update();
    }

    const initial = scrollEl();
    if (initial)
        bindScrollEl(initial);

    // Re-bind if the scroll child is replaced (e.g. Svelte remount).
    const childObserver = new MutationObserver(() => {
        const el = scrollEl();
        if (!el)
            return;
        if (!el.classList.contains('overlay-scrollbar-scroll'))
            bindScrollEl(el);
        else
            update();
    });
    childObserver.observe(host, { childList: true, subtree: true });

    return {
        update(next: OverlayScrollbarParams = {}) {
            fadeDelayMs = next.fadeDelayMs ?? DEFAULT_FADE_DELAY_MS;
            update();
        },
        destroy() {
            clearFadeTimer();
            childObserver.disconnect();
            resizeObserver?.disconnect();
            const el = scrollEl();
            el?.removeEventListener('scroll', onScroll);
            el?.classList.remove('overlay-scrollbar-scroll');
            track.remove();
            host.classList.remove('overlay-scrollbar-host');
        },
    };
}
