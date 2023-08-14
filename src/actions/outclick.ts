
export function outclick(node: HTMLElement) {
    function handleClick(event: MouseEvent) {
        if (!node.contains(event.target as Node)) {
            node.dispatchEvent(new CustomEvent("outclick"));
        }
    }

    document.addEventListener('click', handleClick);

    return {
        destroy() {
            document.removeEventListener('click', handleClick);
        }
    };
}