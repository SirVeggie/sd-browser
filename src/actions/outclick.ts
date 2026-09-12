
import { bindDropdownOutsideClick } from "../lib/tools/dropdownOutsideClick";

export function outclick(node: HTMLElement) {
    let active = false;
    const timer = setTimeout(() => {
        active = true;
    }, 0);

    const unbind = bindDropdownOutsideClick(
        () => active,
        () => {
            node.dispatchEvent(new CustomEvent("outclick"));
        },
        () => node,
    );

    return {
        destroy() {
            clearTimeout(timer);
            unbind();
        },
    };
}
