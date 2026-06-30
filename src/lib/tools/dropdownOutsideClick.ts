/**
 * Close a dropdown when the user clicks outside its root element.
 *
 * Listens in the capture phase because dropdown triggers use stopPropagation
 * on click. Bubble-phase document listeners never run for those clicks, so
 * opening one dropdown would not close another.
 */
export function bindDropdownOutsideClick(
    isOpen: () => boolean,
    close: () => void,
    root: () => HTMLElement | undefined,
): () => void {
    function handleDocumentClick(event: MouseEvent) {
        if (!isOpen() || !root()) return;
        if (!root()!.contains(event.target as Node)) close();
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
}
