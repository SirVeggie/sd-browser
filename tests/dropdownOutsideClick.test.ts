import assert from 'node:assert/strict';
import {
    DISMISS_SWALLOW_MS,
    createOutsideClickController,
    dismissOverlayBackdrop,
    swallowEvent,
} from '../src/lib/tools/dropdownOutsideClick.ts';

type FakeEvent = Event & {
    defaultPrevented: boolean;
    propagationStopped: boolean;
    currentTarget: EventTarget | null;
};

function fakeEvent(
    type: string,
    target: EventTarget | null,
    currentTarget: EventTarget | null = null,
    detail = 1,
): FakeEvent {
    let defaultPrevented = false;
    let propagationStopped = false;
    const event = {
        type,
        target,
        currentTarget,
        detail,
        cancelable: true,
        get defaultPrevented() {
            return defaultPrevented;
        },
        get propagationStopped() {
            return propagationStopped;
        },
        preventDefault() {
            defaultPrevented = true;
        },
        stopPropagation() {
            propagationStopped = true;
        },
        stopImmediatePropagation() {
            propagationStopped = true;
        },
    };
    return event as FakeEvent;
}

{
    const event = fakeEvent('click', null);
    swallowEvent(event);
    assert.equal(event.defaultPrevented, true, 'swallow preventDefaults');
    assert.equal(event.propagationStopped, true, 'swallow stops propagation');
}

{
    const inside = {} as EventTarget;
    const outside = {} as EventTarget;
    let open = true;
    let closed = 0;
    let time = 1000;
    const controller = createOutsideClickController({
        isOpen: () => open,
        close: () => {
            open = false;
            closed += 1;
        },
        isInside: (target) => target === inside,
        now: () => time,
    });

    const innerDown = fakeEvent('pointerdown', inside);
    assert.equal(controller.handle(innerDown), false, 'inside pointerdown is ignored');
    assert.equal(open, true);
    assert.equal(innerDown.defaultPrevented, false);

    const outerDown = fakeEvent('pointerdown', outside);
    assert.equal(controller.handle(outerDown), true, 'outside pointerdown dismisses');
    assert.equal(open, false);
    assert.equal(closed, 1);
    assert.equal(outerDown.defaultPrevented, true);
    assert.equal(outerDown.propagationStopped, true);

    time += 10;
    const ghostClick = fakeEvent('click', outside);
    assert.equal(controller.handle(ghostClick), true, 'click after dismiss is still swallowed');
    assert.equal(closed, 1, 'does not close twice');
    assert.equal(ghostClick.defaultPrevented, true);
    assert.equal(ghostClick.propagationStopped, true);
}

{
    const inside = {} as EventTarget;
    const outside = {} as EventTarget;
    let open = true;
    let closed = 0;
    const controller = createOutsideClickController({
        isOpen: () => open,
        close: () => {
            open = false;
            closed += 1;
        },
        isInside: (target) => target === inside,
        now: () => 1000,
    });

    assert.equal(controller.handle(fakeEvent('pointerdown', inside)), false);
    const outerUp = fakeEvent('pointerup', outside);
    assert.equal(controller.handle(outerUp), false, 'pointerup outside after inside press does not dismiss');
    const outerClick = fakeEvent('click', outside);
    assert.equal(controller.handle(outerClick), false, 'mouse click outside after inside press does not dismiss');
    assert.equal(open, true);
    assert.equal(closed, 0);
    assert.equal(outerClick.defaultPrevented, false);

    const keyboardClick = fakeEvent('click', outside, null, 0);
    assert.equal(controller.handle(keyboardClick), true, 'keyboard click outside still dismisses');
    assert.equal(open, false);
    assert.equal(closed, 1);
}

{
    const outside = {} as EventTarget;
    let open = false;
    const controller = createOutsideClickController({
        isOpen: () => open,
        close: () => {
            open = false;
        },
        isInside: () => false,
        now: () => 0,
    });
    const click = fakeEvent('click', outside);
    assert.equal(controller.handle(click), false, 'closed overlay does not swallow stray clicks');
    assert.equal(click.defaultPrevented, false);
}

{
    const outside = {} as EventTarget;
    let open = true;
    let time = 0;
    const controller = createOutsideClickController({
        isOpen: () => open,
        close: () => {
            open = false;
        },
        isInside: () => false,
        now: () => time,
    });
    assert.equal(controller.handle(fakeEvent('pointerdown', outside)), true);
    time += DISMISS_SWALLOW_MS;
    const later = fakeEvent('click', outside);
    assert.equal(controller.handle(later), false, 'swallow window expires');
    assert.equal(later.defaultPrevented, false);
}

{
    const overlay = {} as EventTarget;
    const dialog = {} as EventTarget;
    let closed = 0;
    const inner = fakeEvent('pointerdown', dialog, overlay);
    dismissOverlayBackdrop(inner, () => {
        closed += 1;
    });
    assert.equal(closed, 0, 'dialog pointerdown does not dismiss overlay');
    assert.equal(inner.defaultPrevented, false);

    const backdrop = fakeEvent('pointerdown', overlay, overlay);
    dismissOverlayBackdrop(backdrop, () => {
        closed += 1;
    });
    assert.equal(closed, 1, 'backdrop pointerdown dismisses overlay');
    assert.equal(backdrop.defaultPrevented, true);
    assert.equal(backdrop.propagationStopped, true);

    const dragClick = fakeEvent('click', overlay, overlay);
    dismissOverlayBackdrop(dragClick, () => {
        closed += 1;
    });
    assert.equal(closed, 1, 'mouse click on backdrop after inside press does not dismiss');
    assert.equal(dragClick.defaultPrevented, false);

    const keyboardClick = fakeEvent('click', overlay, overlay, 0);
    dismissOverlayBackdrop(keyboardClick, () => {
        closed += 1;
    });
    assert.equal(closed, 2, 'keyboard click on backdrop dismisses overlay');
}
