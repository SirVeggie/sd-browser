
export function autofocus(node: HTMLElement, active = true) {
    if (active) {
        node.focus();
    }
}