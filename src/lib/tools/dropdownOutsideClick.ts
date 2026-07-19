/**
 * Close a dropdown when the user clicks outside its root element.
 *
 * Listens in the capture phase because dropdown triggers use stopPropagation
 * on click. Bubble-phase document listeners never run for those clicks, so
 * opening one dropdown would not close another.
 *
 * Outside pointer/click events are swallowed (preventDefault + stopPropagation)
 * so the dismiss does not also activate whatever was under the cursor — same
 * as context-menu `outclick`.
 */
export function bindDropdownOutsideClick(
    isOpen: () => boolean,
    close: () => void,
    root: () => HTMLElement | undefined,
): () => void {
    function consumeOutside(event: Event) {
        if (!isOpen()) return;
        const el = root();
        if (!el || el.contains(event.target as Node)) return;
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
