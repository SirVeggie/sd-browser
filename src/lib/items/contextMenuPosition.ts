export type ContextMenuFitInput = {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Parent menu left edge; used to flip submenus when they overflow the viewport. */
    parentLeft?: number;
};

export type ContextMenuFitResult = {
    x: number;
    y: number;
    flipLeft: boolean;
};

const VIEWPORT_MARGIN = 8;

export function fitContextMenuToViewport(
    input: ContextMenuFitInput,
): ContextMenuFitResult {
    let x = input.x;
    let y = input.y;
    let flipLeft = false;

    const right = x + input.width;
    const bottom = y + input.height;

    if (right > window.innerWidth - VIEWPORT_MARGIN) {
        if (input.parentLeft !== undefined) {
            x = input.parentLeft - input.width;
            flipLeft = true;
        } else {
            x = input.x - (right - window.innerWidth + VIEWPORT_MARGIN);
        }
    }

    if (bottom > window.innerHeight - VIEWPORT_MARGIN) {
        y = input.y - (bottom - window.innerHeight + VIEWPORT_MARGIN);
    }

    y = Math.max(VIEWPORT_MARGIN, y);

    return { x, y, flipLeft };
}
