/**
 * Horizontal scrub-to-adjust for number inputs (port of
 * attachNumberDrag from sv_generation_panel.js).
 *
 * Click still focuses/edits; drag left/right changes the value by step.
 * Vertical-dominant movement is abandoned so the column can scroll.
 */

const DRAG_PIXELS_PER_STEP = 24;
const NUMBER_DRAG_THRESHOLD_PX = 4;
const NUMBER_DRAG_AXIS_LOCK_PX = 10;

export type NumberDragParams = {
    getValue: () => number;
    getStep: () => number;
    getMin?: () => number | undefined;
    getMax?: () => number | undefined;
    onChange: (value: number) => void;
};

function stepDecimalPlaces(step: number): number {
    if (!Number.isFinite(step))
        return 0;
    const text = String(step);
    const dotIndex = text.indexOf('.');
    if (dotIndex === -1)
        return 0;
    return text.length - dotIndex - 1;
}

function dragPixelsPerStep(step: number): number {
    if (!Number.isFinite(step) || step >= 1)
        return DRAG_PIXELS_PER_STEP;
    const places = stepDecimalPlaces(step);
    if (places <= 0)
        return DRAG_PIXELS_PER_STEP;
    return Math.max(1, DRAG_PIXELS_PER_STEP / (2 ** places));
}

function normalizeDragValue(
    rawValue: number,
    step: number,
    min: number | undefined,
    max: number | undefined,
    fallback: number,
): number {
    let value = Number(rawValue);
    if (Number.isNaN(value))
        return fallback;
    if (min != null && Number.isFinite(min))
        value = Math.max(min, value);
    if (max != null && Number.isFinite(max))
        value = Math.min(max, value);
    if (!Number.isFinite(step) || step <= 0)
        return value;

    if (Number.isInteger(step) || stepDecimalPlaces(step) === 0)
        return Math.round(value / step) * step;

    const places = Math.min(12, stepDecimalPlaces(step) + 4);
    const factor = 10 ** places;
    if (Math.abs(value) * factor > Number.MAX_SAFE_INTEGER)
        return Math.round(value / step) * step;
    return Math.round(value * factor) / factor;
}

export function numberDrag(input: HTMLInputElement, params: NumberDragParams) {
    let opts = params;
    let pointerDown = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let currentValue = 0;
    let lastAppliedX = 0;
    let activePointerId: number | null = null;
    let suppressFocus = false;
    let pixelsPerStep = DRAG_PIXELS_PER_STEP;
    let step = 1;

    input.title = 'Click to edit, drag horizontally to adjust';

    const clearWindowListeners = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', endDrag);
    };

    const applyDragValue = (nextValue: number) => {
        const clamped = normalizeDragValue(
            nextValue,
            step,
            opts.getMin?.(),
            opts.getMax?.(),
            currentValue,
        );
        if (Object.is(clamped, currentValue))
            return;
        input.value = String(clamped);
        opts.onChange(clamped);
        currentValue = clamped;
    };

    const abandonForScroll = () => {
        pointerDown = false;
        dragging = false;
        activePointerId = null;
        suppressFocus = false;
        clearWindowListeners();
    };

    function onPointerMove(event: PointerEvent) {
        if (!pointerDown || event.pointerId !== activePointerId)
            return;

        const clientX = event.clientX;
        const clientY = event.clientY;
        if (!dragging) {
            const dx = clientX - startX;
            const dy = clientY - startY;
            const lockPx = suppressFocus ? NUMBER_DRAG_AXIS_LOCK_PX : NUMBER_DRAG_THRESHOLD_PX;
            if (Math.hypot(dx, dy) < lockPx)
                return;

            if (Math.abs(dy) > Math.abs(dx)) {
                abandonForScroll();
                return;
            }

            dragging = true;
            input.classList.add('dragging');
            input.blur();
            try {
                input.setPointerCapture?.(event.pointerId);
            } catch {
                /* capture can fail when move is on window */
            }
        }

        event.preventDefault();
        const delta = clientX - lastAppliedX;
        const steps = Math.trunc(delta / pixelsPerStep);
        if (steps === 0)
            return;

        lastAppliedX += steps * pixelsPerStep;
        applyDragValue(currentValue + steps * step);
    }

    function endDrag(event: PointerEvent) {
        if (!pointerDown || event.pointerId !== activePointerId)
            return;

        const didDrag = dragging;
        const cancelled = event.type === 'pointercancel';
        if (dragging) {
            event.preventDefault();
            input.classList.remove('dragging');
            try {
                input.releasePointerCapture?.(event.pointerId);
            } catch {
                /* ignore */
            }
        }

        pointerDown = false;
        dragging = false;
        activePointerId = null;
        clearWindowListeners();

        if (!didDrag && !cancelled && suppressFocus) {
            input.focus();
            input.select?.();
        }
        suppressFocus = false;
    }

    function startPointer(event: PointerEvent) {
        if (event.button !== 0)
            return;

        suppressFocus = event.pointerType !== 'mouse';
        if (suppressFocus)
            event.preventDefault();

        step = opts.getStep();
        if (!Number.isFinite(step) || step <= 0)
            step = 1;
        pixelsPerStep = dragPixelsPerStep(step);

        pointerDown = true;
        dragging = false;
        activePointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        lastAppliedX = startX;

        const fromField = Number(opts.getValue());
        currentValue = Number.isFinite(fromField)
            ? fromField
            : (Number(input.value) || 0);

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
    }

    input.addEventListener('pointerdown', startPointer);

    return {
        update(next: NumberDragParams) {
            opts = next;
        },
        destroy() {
            clearWindowListeners();
            input.removeEventListener('pointerdown', startPointer);
            input.classList.remove('dragging');
        },
    };
}
