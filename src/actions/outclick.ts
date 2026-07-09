
export function outclick(node: HTMLElement) {
    let active = false;
    const timer = setTimeout(() => {
        active = true;
    }, 0);

    function isOutside(event: Event) {
        if (!active) return false;
        return !node.contains(event.target as Node);
    }

    function consumeOutside(event: Event) {
        if (!isOutside(event)) return;
        event.preventDefault();
        event.stopPropagation();
        node.dispatchEvent(new CustomEvent("outclick"));
    }

    const capture = true;

    // Capture phase so dismiss runs before image mousedown/mouseup handlers.
    document.addEventListener("pointerdown", consumeOutside, capture);
    document.addEventListener("touchstart", consumeOutside, capture);
    document.addEventListener("click", consumeOutside, capture);

    return {
        destroy() {
            clearTimeout(timer);
            document.removeEventListener("pointerdown", consumeOutside, capture);
            document.removeEventListener("touchstart", consumeOutside, capture);
            document.removeEventListener("click", consumeOutside, capture);
        },
    };
}
