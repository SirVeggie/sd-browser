import type { SvgenCard, SvgenLayoutState, ColumnPlacement } from './types';
import { normalizeIntControlModes } from './intControl';

export function emptyLayout(): SvgenLayoutState {
    return {
        columns: {
            '1': { columns: [[]] },
            '2': { columns: [[], []] },
        },
        collapsedNodeIds: [],
        hiddenFields: {},
        fieldOrder: {},
        intControlModes: {},
        nodeSignatures: {},
    };
}

export function buildAutoColumnPlacement(nodeIds: string[], count: 1 | 2): ColumnPlacement {
    if (count === 1)
        return { columns: [nodeIds.slice()] };

    const left: string[] = [];
    const right: string[] = [];
    nodeIds.forEach((id, index) => {
        if (index % 2 === 0)
            left.push(id);
        else
            right.push(id);
    });
    return { columns: [left, right] };
}

export function ensureBaseLayouts(layout: SvgenLayoutState, nodeIds: string[]): SvgenLayoutState {
    const next = structuredClone(layout);
    const known = new Set(nodeIds);

    const sanitize = (placement: ColumnPlacement, cols: number): ColumnPlacement => {
        const columns = Array.from({ length: cols }, (_, i) =>
            (placement.columns[i] ?? []).filter((id) => known.has(id)),
        );
        const placed = new Set(columns.flat());
        for (const id of nodeIds) {
            if (!placed.has(id))
                columns[0].push(id);
        }
        return { columns };
    };

    const oneEmpty = !next.columns['1']?.columns?.some((c) => c.length);
    const twoEmpty = !next.columns['2']?.columns?.some((c) => c.length);

    next.columns['1'] = oneEmpty
        ? buildAutoColumnPlacement(nodeIds, 1)
        : sanitize(next.columns['1'], 1);
    next.columns['2'] = twoEmpty
        ? buildAutoColumnPlacement(nodeIds, 2)
        : sanitize(next.columns['2'], 2);

    if (next.columns['3']) {
        const three = sanitize(next.columns['3'], 3);
        if (!three.columns[2]?.length)
            delete next.columns['3'];
        else
            next.columns['3'] = three;
    }

    return next;
}

export function signaturesFromCards(cards: SvgenCard[], _nodes?: ComfyWorkflowNode[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const card of cards)
        out[card.nodeId] = `${card.nodeType}\u0000${card.title}\u0000`;
    return out;
}

/** Width breakpoints for how many column slots the panel can show. */
export function columnSlotsForWidth(widthPx: number): 1 | 2 | 3 {
    if (widthPx >= 960)
        return 3;
    if (widthPx >= 560)
        return 2;
    return 1;
}

/**
 * Effective column count for rendering:
 * - always 1 or 2 from width
 * - 3 only if width allows AND a 3-col layout exists with cards in col 3
 */
export function effectiveColumnCount(
    widthPx: number,
    layout: SvgenLayoutState,
): 1 | 2 | 3 {
    const slots = columnSlotsForWidth(widthPx);
    if (slots >= 3 && layout.columns['3']?.columns[2]?.length)
        return 3;
    if (slots >= 2)
        return 2;
    return 1;
}

export function placementForCount(
    layout: SvgenLayoutState,
    count: 1 | 2 | 3,
): ColumnPlacement {
    if (count === 3 && layout.columns['3'])
        return layout.columns['3'];
    if (count === 2)
        return layout.columns['2'];
    return layout.columns['1'];
}

export function writePlacementColumns(
    layout: SvgenLayoutState,
    count: 1 | 2 | 3,
    columns: string[][],
): SvgenLayoutState {
    const next = structuredClone(layout);
    const placement: ColumnPlacement = { columns: columns.map((col) => col.slice()) };

    if (count === 1)
        next.columns['1'] = placement;
    else if (count === 2)
        next.columns['2'] = placement;
    else {
        if (!placement.columns[2]?.length)
            delete next.columns['3'];
        else
            next.columns['3'] = placement;
    }

    return next;
}

export function moveCard(
    layout: SvgenLayoutState,
    count: 1 | 2 | 3,
    nodeId: string,
    toColumn: number,
    toIndex: number,
): SvgenLayoutState {
    const placement = placementForCount(layout, count);
    const columns = placement.columns.map((col) => col.filter((id) => id !== nodeId));

    while (columns.length < count)
        columns.push([]);

    const col = Math.max(0, Math.min(toColumn, columns.length - 1));
    const index = Math.max(0, Math.min(toIndex, columns[col].length));
    columns[col].splice(index, 0, nodeId);
    return writePlacementColumns(layout, count, columns);
}

/** Replace one column's order (SortableList commit). */
export function setColumnOrder(
    layout: SvgenLayoutState,
    count: 1 | 2 | 3,
    columnIndex: number,
    ids: string[],
): SvgenLayoutState {
    const placement = placementForCount(layout, count);
    const columns = placement.columns.map((col) => col.slice());
    while (columns.length < count)
        columns.push([]);
    const col = Math.max(0, Math.min(columnIndex, columns.length - 1));
    columns[col] = ids.slice();
    return writePlacementColumns(layout, count, columns);
}

export function parseLayoutJson(raw: string | null | undefined): SvgenLayoutState {
    if (!raw)
        return emptyLayout();
    try {
        const parsed = JSON.parse(raw) as SvgenLayoutState;
        if (!parsed?.columns?.['1'] || !parsed?.columns?.['2'])
            return emptyLayout();
        return {
            ...emptyLayout(),
            ...parsed,
            columns: {
                '1': parsed.columns['1'],
                '2': parsed.columns['2'],
                ...(parsed.columns['3'] ? { '3': parsed.columns['3'] } : {}),
            },
            intControlModes: normalizeIntControlModes(parsed.intControlModes),
        };
    } catch {
        return emptyLayout();
    }
}
