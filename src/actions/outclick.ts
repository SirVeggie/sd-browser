
export function outclick(node: HTMLElement) {
    function handleClick(event: MouseEvent) {
        if (!node.contains(event.target as Node)) {
            node.dispatchEvent(new CustomEvent("outclick"));
        }
    }
    function handleTouch(event: TouchEvent) {
        if (!node.contains(event.target as Node)) {
            node.dispatchEvent(new CustomEvent("outclick"));
        }
    }

    document.addEventListener('click', handleClick);
    document.addEventListener('touchstart', handleTouch);

    return {
        destroy() {
            document.removeEventListener('click', handleClick);
            document.removeEventListener('touchstart', handleTouch);
        }
    };
}