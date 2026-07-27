import type { IntControlMode, SvgenCard, SvgenLayoutState } from './types';
import { emptyLayout, ensureBaseLayouts } from './layout';
import { orderedNodeIdsForAutoLayout } from './cardOrder';

export type MatchableCard = {
    nodeId: string;
    /** Comfy class / subgraph type (not display title). */
    nodeType: string;
    title: string;
    /** Widget names present on the card (for field remap fallbacks). */
    fieldNames: string[];
};

export type CardMatchResult = {
    /** Saved nodeId → new nodeId */
    savedToNext: Map<string, string>;
    matched: number;
};

function normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function looseTitle(title: string): string {
    return title.replace(/\s+\d+$/, '').replace(/\s*\(\d+\)$/, '').trim();
}

export function matchableFromCards(cards: readonly SvgenCard[]): MatchableCard[] {
    return cards.map((card) => ({
        nodeId: card.nodeId,
        nodeType: card.nodeType,
        title: card.title,
        fieldNames: card.fields.map((field) => field.widgetName),
    }));
}

/**
 * Match next cards onto saved cards without using field schemas/values.
 *
 * Priority: run the strictest pass first, then incrementally looser passes over
 * whatever remains unmatched. Each pass indexes only by that pass's key so a
 * looser identity cannot steal a pair that a stricter pass should own.
 *
 * 1. Exact type + title
 * 2. Type + loose title (strip trailing ` 2` / ` (2)` copy suffixes)
 * 3. Unique type only (skip if multiple candidates)
 * 4. Unique title only (skip if multiple candidates)
 */
export function matchCardsByIdentity(
    nextCards: readonly MatchableCard[],
    savedCards: readonly MatchableCard[],
): CardMatchResult {
    const savedToNext = new Map<string, string>();
    const usedNext = new Set<string>();
    const usedSaved = new Set<string>();

    const tryPass = (
        keyPicker: (card: MatchableCard) => string | null,
        requireUnique: boolean,
    ) => {
        const savedIndex = new Map<string, MatchableCard[]>();
        for (const card of savedCards) {
            if (usedSaved.has(card.nodeId))
                continue;
            const key = keyPicker(card);
            if (!key)
                continue;
            const list = savedIndex.get(key) ?? [];
            list.push(card);
            savedIndex.set(key, list);
        }

        for (const next of nextCards) {
            if (usedNext.has(next.nodeId))
                continue;
            const key = keyPicker(next);
            if (!key)
                continue;
            const candidates = (savedIndex.get(key) ?? []).filter((card) => !usedSaved.has(card.nodeId));
            if (!candidates.length)
                continue;
            if (requireUnique && candidates.length !== 1)
                continue;
            const saved = candidates[0]!;
            savedToNext.set(saved.nodeId, next.nodeId);
            usedSaved.add(saved.nodeId);
            usedNext.add(next.nodeId);
        }
    };

    // 1. Strict: type + exact title
    tryPass((card) => {
        const type = normalizeKey(card.nodeType);
        const title = normalizeKey(card.title);
        return type && title ? `tt:${type}\u0000${title}` : null;
    }, false);

    // 2. Looser: type + title without copy/number suffix
    tryPass((card) => {
        const type = normalizeKey(card.nodeType);
        const title = looseTitle(normalizeKey(card.title));
        return type && title ? `tt:${type}\u0000${title}` : null;
    }, false);

    // 3. Unique type only
    tryPass((card) => {
        const type = normalizeKey(card.nodeType);
        return type ? `t:${type}` : null;
    }, true);

    // 4. Unique title only
    tryPass((card) => {
        const title = normalizeKey(card.title);
        return title ? `n:${title}` : null;
    }, true);

    return { savedToNext, matched: savedToNext.size };
}

/** Map a widget name onto another card's names (exact → normalized → suffix/proxy). */
export function remapFieldName(savedName: string, nextNames: readonly string[]): string | null {
    if (nextNames.includes(savedName))
        return savedName;
    const normalized = normalizeKey(savedName);
    const exact = nextNames.find((name) => normalizeKey(name) === normalized);
    if (exact)
        return exact;
    // Suffix / proxy path fallback: "12:strength" vs "strength"
    const savedTail = savedName.includes(':') ? savedName.slice(savedName.lastIndexOf(':') + 1) : savedName;
    const tailNorm = normalizeKey(savedTail);
    const byTail = nextNames.find((name) => {
        const tail = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
        return normalizeKey(tail) === tailNorm;
    });
    return byTail ?? null;
}

function remapStringList(
    savedList: string[] | undefined,
    nextNames: readonly string[],
): string[] {
    if (!savedList?.length)
        return [];
    const out: string[] = [];
    const used = new Set<string>();
    for (const savedName of savedList) {
        const mapped = remapFieldName(savedName, nextNames);
        if (mapped && !used.has(mapped)) {
            out.push(mapped);
            used.add(mapped);
        }
    }
    return out;
}

function remapKeyedRecord<T>(
    record: Record<string, T> | undefined,
    savedToNext: Map<string, string>,
    mapValue: (savedNodeId: string, nextNodeId: string, value: T) => T | undefined,
): Record<string, T> {
    const out: Record<string, T> = {};
    if (!record)
        return out;
    for (const [savedNodeId, value] of Object.entries(record)) {
        const nextNodeId = savedToNext.get(savedNodeId);
        if (!nextNodeId)
            continue;
        const mapped = mapValue(savedNodeId, nextNodeId, value);
        if (mapped !== undefined)
            out[nextNodeId] = mapped;
    }
    return out;
}

function remapIntControlModes(
    modes: Record<string, IntControlMode> | undefined,
    savedToNext: Map<string, string>,
    nextById: Map<string, MatchableCard>,
): Record<string, IntControlMode> {
    const out: Record<string, IntControlMode> = {};
    if (!modes)
        return out;
    for (const [key, mode] of Object.entries(modes)) {
        const parts = key.split(':');
        if (parts.length < 2)
            continue;
        const savedNodeId = parts[0]!;
        const nextNodeId = savedToNext.get(savedNodeId);
        if (!nextNodeId)
            continue;
        const nextCard = nextById.get(nextNodeId);
        if (!nextCard)
            continue;
        const rest = parts.slice(1);
        const widgetName = rest[rest.length - 1]!;
        const mappedWidget = remapFieldName(widgetName, nextCard.fieldNames);
        if (!mappedWidget)
            continue;
        if (rest.length === 1)
            out[`${nextNodeId}:${mappedWidget}`] = mode;
        else {
            const inner = rest.slice(0, -1).join(':');
            out[`${nextNodeId}:${inner}:${mappedWidget}`] = mode;
        }
    }
    return out;
}

/** Remap a saved layout onto new node ids; keep as much placement/prefs as possible. */
export function remapLayoutToCards(
    savedLayout: SvgenLayoutState,
    savedToNext: Map<string, string>,
    nextCards: readonly SvgenCard[],
): SvgenLayoutState {
    const nextById = new Map(matchableFromCards(nextCards).map((card) => [card.nodeId, card]));
    const orderedIds = orderedNodeIdsForAutoLayout(nextCards);

    const remapPlacement = (columns: string[][]): string[][] =>
        columns.map((col) =>
            col
                .map((savedId) => savedToNext.get(savedId))
                .filter((id): id is string => !!id),
        );

    const remapped: SvgenLayoutState = {
        ...emptyLayout(),
        columns: {
            '1': {
                columns: remapPlacement(savedLayout.columns['1']?.columns ?? [[]]),
            },
            '2': {
                columns: remapPlacement(savedLayout.columns['2']?.columns ?? [[], []]),
            },
            ...(savedLayout.columns['3']
                ? {
                    '3': {
                        columns: remapPlacement(savedLayout.columns['3'].columns ?? [[], [], []]),
                    },
                }
                : {}),
        },
        collapsedNodeIds: savedLayout.collapsedNodeIds
            .map((id) => savedToNext.get(id))
            .filter((id): id is string => !!id),
        hiddenFields: remapKeyedRecord(
            savedLayout.hiddenFields,
            savedToNext,
            (_saved, nextId, names) => {
                const card = nextById.get(nextId);
                if (!card)
                    return undefined;
                const mapped = remapStringList(names, card.fieldNames);
                return mapped.length ? mapped : undefined;
            },
        ),
        fieldOrder: remapKeyedRecord(
            savedLayout.fieldOrder,
            savedToNext,
            (_saved, nextId, names) => {
                const card = nextById.get(nextId);
                if (!card)
                    return undefined;
                const mapped = remapStringList(names, card.fieldNames);
                // Append any new fields not mentioned in saved order
                for (const name of card.fieldNames) {
                    if (!mapped.includes(name))
                        mapped.push(name);
                }
                return mapped.length ? mapped : undefined;
            },
        ),
        intControlModes: remapIntControlModes(
            savedLayout.intControlModes,
            savedToNext,
            nextById,
        ),
        nodeSignatures: {},
    };

    return ensureBaseLayouts(remapped, orderedIds);
}

export type SavedLayoutCandidate = {
    workflowId: string;
    cards: MatchableCard[];
    layout: SvgenLayoutState;
};

/**
 * Pick the saved layout with the most identity matches (≥ 50% of next cards).
 * Returns null when nothing clears the threshold.
 */
export function pickBestSavedLayout(
    nextCards: readonly SvgenCard[],
    candidates: readonly SavedLayoutCandidate[],
): { workflowId: string; layout: SvgenLayoutState; matched: number } | null {
    if (!nextCards.length || !candidates.length)
        return null;

    const nextMatchable = matchableFromCards(nextCards);
    let best: {
        workflowId: string;
        layout: SvgenLayoutState;
        matched: number;
        ratio: number;
    } | null = null;

    for (const candidate of candidates) {
        if (!candidate.cards.length)
            continue;
        const { savedToNext, matched } = matchCardsByIdentity(nextMatchable, candidate.cards);
        const ratio = matched / nextCards.length;
        if (ratio < 0.5)
            continue;
        if (
            !best
            || matched > best.matched
            || (matched === best.matched && ratio > best.ratio)
        ) {
            best = {
                workflowId: candidate.workflowId,
                layout: remapLayoutToCards(candidate.layout, savedToNext, nextCards),
                matched,
                ratio,
            };
        }
    }

    return best
        ? { workflowId: best.workflowId, layout: best.layout, matched: best.matched }
        : null;
}

/** Build matchable cards from layout.nodeSignatures when workflow JSON is unavailable. */
export function matchableFromSignatures(
    nodeSignatures: Record<string, string> | undefined,
): MatchableCard[] {
    if (!nodeSignatures)
        return [];
    const out: MatchableCard[] = [];
    for (const [nodeId, signature] of Object.entries(nodeSignatures)) {
        const [nodeType = '', title = ''] = signature.split('\u0000');
        out.push({
            nodeId,
            nodeType,
            title,
            fieldNames: [],
        });
    }
    return out;
}
