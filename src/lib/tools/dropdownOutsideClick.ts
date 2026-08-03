/**
 * Close a dropdown when the user clicks outside its root element(s).
 *
 * Listens in the capture phase because dropdown triggers use stopPropagation
 * on click. Bubble-phase document listeners never run for those clicks, so
 * opening one dropdown would not close another.
 *
 * Outside pointer/click events are swallowed (preventDefault + stopPropagation)
 * so the dismiss does not also activate whatever was under the cursor — same
 * as context-menu `outclick`.
 *
 * `root` may return one element or several (e.g. trigger + body-portaled panel).
 */
export function bindDropdownOutsideClick(
    isOpen: () => boolean,
    close: () => void,
    root: () => HTMLElement | undefined | Array<HTMLElement | undefined>,
): () => void {
    function consumeOutside(event: Event) {
        if (!isOpen()) return;
        const roots = root();
        const list = Array.isArray(roots) ? roots : [roots];
        const target = event.target as Node;
        if (list.some((el) => el?.contains(target))) return;
        event.preventDefault();
        event.stopPropagation();
        close();
    }

    const capture = true;
    document.addEventListener("pointerdown", consumeOutside, capture);
    document.addEventListener("touchstart", consumeOutside, capture);
    document.addEventListener("click", consumeOutside, capture);
    return () => {
        document.removeEventListener("pointerdown", consumeOutside, capture);
        document.removeEventListener("touchstart", consumeOutside, capture);
        document.removeEventListener("click", consumeOutside, capture);
    };
}
