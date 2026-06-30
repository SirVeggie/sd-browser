export function alignDropdownPanel(
    root: HTMLElement,
    valueAnchor: HTMLElement,
    optionPadLeftEm = 0.7,
    nudgeLeftEm = 0.1,
): number {
    const fontSize = parseFloat(getComputedStyle(root).fontSize);
    const optionPadLeft = fontSize * optionPadLeftEm;
    const nudgeLeft = fontSize * nudgeLeftEm;
    const rootRect = root.getBoundingClientRect();
    const valueRect = valueAnchor.getBoundingClientRect();
    return valueRect.left - rootRect.left - optionPadLeft - nudgeLeft;
}
