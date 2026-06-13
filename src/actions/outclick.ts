
export function outclick(node: HTMLElement) {
    let active = false;
    const timer = setTimeout(() => {
        active = true;
    }, 0);

    function handleClick(event: MouseEvent) {
        if (!active) return;
        if (!node.contains(event.target as Node)) {
            node.dispatchEvent(new CustomEvent("outclick"));
        }
    }

    function handleTouch(event: TouchEvent) {
        if (!active) return;
        if (!node.contains(event.target as Node)) {
            node.dispatchEvent(new CustomEvent("outclick"));
        }
    }

    document.addEventListener('click', handleClick);
    document.addEventListener('touchstart', handleTouch);

    return {
        destroy() {
            clearTimeout(timer);
            document.removeEventListener('click', handleClick);
            document.removeEventListener('touchstart', handleTouch);
        }
    };
}
