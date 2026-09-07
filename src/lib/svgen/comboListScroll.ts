export type ComboListScrollAlign = 'center' | 'nearest';

/** Delta to add to a list's `scrollTop`. Does not clamp. */
export function comboListScrollDelta(
    listTop: number,
    listBottom: number,
    itemTop: number,
    itemBottom: number,
    align: ComboListScrollAlign,
): number {
    switch (align) {
        case 'center':
            return (itemTop + itemBottom) / 2 - (listTop + listBottom) / 2;
        case 'nearest':
            if (itemTop < listTop)
                return itemTop - listTop;
            if (itemBottom > listBottom)
                return itemBottom - listBottom;
            return 0;
        default: {
            const _exhaustive: never = align;
            return _exhaustive;
        }
    }
}
