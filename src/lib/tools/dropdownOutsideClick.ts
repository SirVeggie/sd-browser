/**
 * Close a dropdown/overlay when the user clicks outside its root element(s).
 *
 * Listens in the capture phase because dropdown triggers use stopPropagation
 * on click. Bubble-phase document listeners never run for those clicks, so
 * opening one dropdown would not close another.
 *
 * Outside pointer/click events are swallowed (preventDefault + stopPropagation)
 * so the dismiss does not also activate whatever was under the cursor — same
 * as context-menu `outclick`.
 *
 * Dismiss only on gesture start (`pointerdown` / `touchstart`), not on `click`
 * / `pointerup`. A press that starts inside (text selection) and is released
 * outside must not close — the `click` target is the common ancestor, often
 * the backdrop. Keyboard activation is a `click` with `detail === 0`.
 *
 * Closing on `pointerdown` unmounts the overlay before the browser dispatches
 * the rest of the gesture (`pointerup`, compatibility `mousedown`/`click`,
 * delayed touch `click`). Those events retarget onto whatever is now under
 * the cursor unless we keep swallowing until the gesture ends.
 *
 * `root` may return one element or several (e.g. trigger + body-portaled panel).
 */

export const DISMISS_SWALLOW_MS = 400;

const DISMISS_EVENTS = ['pointerdown', 'touchstart', 'click'] as const;
const TRAILING_EVENTS = [
    'pointerup',
    'pointercancel',
    'mousedown',
    'mouseup',
    'touchend',
    'touchstart',
    'click',
] as const;

const captureOpts: AddEventListenerOptions = { capture: true, passive: false };

let trailingUntil = 0;
let trailingBound = false;

export function swallowEvent(event: Event): void {
    if (event.cancelable)
        event.preventDefault();
    event.stopPropagation();
}

/** True for a new dismiss gesture, not a leftover click after an inside press. */
export function isGestureDismissStart(event: Event): boolean {
    switch (event.type) {
        case 'pointerdown':
        case 'touchstart':
            return true;
        case 'click':
            return 'detail' in event && (event as MouseEvent).detail === 0;
        default:
            return false;
    }
}

function trailingListener(event: Event) {
    if (Date.now() >= trailingUntil) {
        unbindTrailingSwallow();
        return;
    }
    swallowEvent(event);
    if (event.type === 'click')
        unbindTrailingSwallow();
}

function unbindTrailingSwallow() {
    if (!trailingBound)
        return;
    trailingBound = false;
    trailingUntil = 0;
    if (typeof document === 'undefined')
        return;
    for (const type of TRAILING_EVENTS)
        document.removeEventListener(type, trailingListener, true);
}

/**
 * Keep consuming leftover pointer/mouse/click events after an overlay unmounts.
 * Safe to call from SSR (no-op) and from a component that immediately destroys
 * its own outside-click listeners.
 */
export function armDismissEventSwallow(now = Date.now()): void {
    trailingUntil = now + DISMISS_SWALLOW_MS;
    if (typeof document === 'undefined' || trailingBound)
        return;
    trailingBound = true;
    for (const type of TRAILING_EVENTS)
        document.addEventListener(type, trailingListener, captureOpts);
}

/**
 * Dismiss an overlay and swallow the rest of the gesture so the leftover
 * `click` does not hit whatever is behind it.
 */
export function dismissOverlay(event: Event, close: () => void): void {
    if (!isGestureDismissStart(event))
        return;
    swallowEvent(event);
    close();
    armDismissEventSwallow();
}

/**
 * Backdrop handler for full-screen overlays (image pickers, Modal, tag picker).
 * Only dismisses when the event target is the overlay itself (not the dialog).
 */
export function dismissOverlayBackdrop(event: Event, close: () => void): void {
    if (event.target !== event.currentTarget)
        return;
    dismissOverlay(event, close);
}

export type OutsideClickController = {
    handle(event: Event): boolean;
};

export function createOutsideClickController(opts: {
    isOpen: () => boolean;
    close: () => void;
    isInside: (target: EventTarget | null) => boolean;
    now?: () => number;
    swallowMs?: number;
}): OutsideClickController {
    let swallowUntil = 0;
    const now = opts.now ?? Date.now;
    const swallowMs = opts.swallowMs ?? DISMISS_SWALLOW_MS;

    return {
        handle(event: Event): boolean {
            const t = now();
            if (t < swallowUntil) {
                swallowEvent(event);
                if (event.type === 'click')
                    swallowUntil = 0;
                return true;
            }
            if (!opts.isOpen())
                return false;
            if (!isGestureDismissStart(event))
                return false;
            if (opts.isInside(event.target))
                return false;
            swallowEvent(event);
            opts.close();
            swallowUntil = t + swallowMs;
            return true;
        },
    };
}

function rootsContain(
    roots: HTMLElement | undefined | Array<HTMLElement | undefined>,
    target: EventTarget | null,
): boolean {
    if (!(target instanceof Node))
        return false;
    const list = Array.isArray(roots) ? roots : [roots];
    return list.some((el) => el?.contains(target));
}

export function bindDropdownOutsideClick(
    isOpen: () => boolean,
    close: () => void,
    root: () => HTMLElement | undefined | Array<HTMLElement | undefined>,
): () => void {
    const controller = createOutsideClickController({
        isOpen,
        close: () => {
            close();
            armDismissEventSwallow();
        },
        isInside: (target) => rootsContain(root(), target),
    });

    function consumeOutside(event: Event) {
        controller.handle(event);
    }

    if (typeof document === 'undefined')
        return () => {};

    const types = new Set<string>([...DISMISS_EVENTS, ...TRAILING_EVENTS]);
    for (const type of types)
        document.addEventListener(type, consumeOutside, captureOpts);
    return () => {
        for (const type of types)
            document.removeEventListener(type, consumeOutside, true);
    };
}
