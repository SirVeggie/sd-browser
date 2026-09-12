import type { IntControlMode, SvgenCard, SvgenLayoutState } from './types';
import { emptyLayout, ensureBaseLayouts } from './layout';
import { orderedNodeIdsForAutoLayout } from './cardOrder';

export type MatchableCard = {
    nodeId: string;
    /** Comfy class / subgraph type (not display title). */
    nodeType: string;
    title: string;
    /** Subgraph definition name when this card is a subgraph shell. */
    subgraphName: string;
    /** Widget names present on the card (for field remap fallbacks). */
    fieldNames: string[];
};

export type CardMatchResult = {
    /** Saved nodeId → new nodeId */
    savedToNext: Map<string, string>;
    matched: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_OVERLAP_MIN_SHARED = 2;
const FIELD_OVERLAP_THRESHOLD = 0.7;
const FIELD_OVERLAP_MARGIN = 0.15;

function normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function looseTitle(title: string): string {
    return title.replace(/\s+\d+$/, '').replace(/\s*\(\d+\)$/, '').trim();
}

function isUuidLike(value: string): boolean {
    return UUID_RE.test(value.trim());
}

/** Subgraph definition ids change when promoted widgets are added or removed. */
function isUnstableNodeType(type: string): boolean {
    return isUuidLike(type);
}

function semanticTitle(card: MatchableCard): string {
    const title = normalizeKey(card.title);
    if (title && !isUuidLike(card.title))
        return title;
    const subgraphName = normalizeKey(card.subgraphName);
    if (subgraphName && !isUuidLike(card.subgraphName))
        return subgraphName;
    return '';
}

export function matchableFromCards(cards: readonly SvgenCard[]): MatchableCard[] {
    return cards.map((card) => ({
        nodeId: card.nodeId,
        nodeType: card.nodeType,
        title: card.title,
        subgraphName: card.subgraphName ?? '',
        fieldNames: card.fields.map((field) => field.widgetName),
    }));
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

function matchedFieldCount(fromNames: readonly string[], toNames: readonly string[]): number {
    const remaining = [...toNames];
    let hits = 0;
    for (const name of fromNames) {
        const mapped = remapFieldName(name, remaining);
        if (!mapped)
            continue;
        hits += 1;
        const index = remaining.indexOf(mapped);
        if (index >= 0)
            remaining.splice(index, 1);
    }
    return hits;
}

/** Ranking overlap: empty lists score 0; a single shared name is allowed. */
function rankOverlap(aNames: readonly string[], bNames: readonly string[]): number {
    if (!aNames.length || !bNames.length)
        return 0;
    const denom = Math.min(aNames.length, bNames.length);
    return denom ? matchedFieldCount(aNames, bNames) / denom : 0;
}

/**
 * Identity overlap for remainder pairing. Require at least two shared names so a
 * lone `text` / `seed` cannot glue unrelated cards.
 */
function overlapCoefficient(aNames: readonly string[], bNames: readonly string[]): number {
    if (!aNames.length || !bNames.length)
        return 0;
    const hits = matchedFieldCount(aNames, bNames);
    if (hits < FIELD_OVERLAP_MIN_SHARED)
        return 0;
    const denom = Math.min(aNames.length, bNames.length);
    return denom ? hits / denom : 0;
}

function pickRankedCandidate(next: MatchableCard, candidates: readonly MatchableCard[]): MatchableCard {
    if (candidates.length === 1)
        return candidates[0]!;
    let best = candidates[0]!;
    let bestOverlap = rankOverlap(next.fieldNames, best.fieldNames);
    let bestId = next.nodeId === best.nodeId ? 1 : 0;
    for (const candidate of candidates.slice(1)) {
        const overlap = rankOverlap(next.fieldNames, candidate.fieldNames);
        const idMatch = next.nodeId === candidate.nodeId ? 1 : 0;
        if (overlap > bestOverlap || (overlap === bestOverlap && idMatch > bestId)) {
            best = candidate;
            bestOverlap = overlap;
            bestId = idMatch;
        }
    }
    return best;
}

/**
 * Match next cards onto saved cards.
 *
 * Priority: run the strictest pass first, then incrementally looser passes over
 * whatever remains unmatched. Each pass indexes only by that pass's key so a
 * looser identity cannot steal a pair that a stricter pass should own.
 *
 * 1. Exact type + title
 * 2. Type + loose title (strip trailing ` 2` / ` (2)` copy suffixes)
 * 3. Unique type only (skip if multiple candidates)
 * 4. Unique title only (skip if multiple candidates)
 * 5. Unique title among UUID-typed leftovers (subgraph schema edits mint a new type)
 * 6. Unique subgraph name among UUID leftovers
 * 7. Ranked title among UUID leftovers (fields → same nodeId → order)
 * 8. Ranked loose title among UUID leftovers
 * 9. UUID-gated field overlap (retitle + schema edit; skip ambiguous ties)
 */
export function matchCardsByIdentity(
    nextCards: readonly MatchableCard[],
    savedCards: readonly MatchableCard[],
): CardMatchResult {
    const savedToNext = new Map<string, string>();
    const usedNext = new Set<string>();
    const usedSaved = new Set<string>();

    const pair = (saved: MatchableCard, next: MatchableCard) => {
        savedToNext.set(saved.nodeId, next.nodeId);
        usedSaved.add(saved.nodeId);
        usedNext.add(next.nodeId);
    };

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
            pair(candidates[0]!, next);
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

    // 5. Unique title among UUID leftovers (type is unstable across subgraph edits)
    tryPass((card) => {
        if (!isUnstableNodeType(card.nodeType))
            return null;
        const title = semanticTitle(card);
        return title ? `ut:${title}` : null;
    }, true);

    // 6. Unique subgraph definition name among UUID leftovers
    tryPass((card) => {
        if (!isUnstableNodeType(card.nodeType))
            return null;
        const name = normalizeKey(card.subgraphName);
        if (!name || isUuidLike(card.subgraphName))
            return null;
        return `us:${name}`;
    }, true);

    const tryRankedUuidTitlePass = (useLoose: boolean) => {
        const titleKey = (card: MatchableCard): string | null => {
            if (!isUnstableNodeType(card.nodeType))
                return null;
            const normalized = semanticTitle(card);
            const title = useLoose ? looseTitle(normalized) : normalized;
            return title || null;
        };

        for (const next of nextCards) {
            if (usedNext.has(next.nodeId))
                continue;
            const key = titleKey(next);
            if (!key)
                continue;
            const candidates = savedCards.filter((saved) =>
                !usedSaved.has(saved.nodeId) && titleKey(saved) === key
            );
            if (!candidates.length)
                continue;
            pair(pickRankedCandidate(next, candidates), next);
        }
    };

    // 7–8. Non-unique UUID titles: field overlap, then same nodeId, then order
    tryRankedUuidTitlePass(false);
    tryRankedUuidTitlePass(true);

    // 9. UUID-gated field overlap for remainders (retitle + schema edit)
    const leftoverCount = () =>
        nextCards.reduce((count, card) => count + (usedNext.has(card.nodeId) ? 0 : 1), 0)
        + savedCards.reduce((count, card) => count + (usedSaved.has(card.nodeId) ? 0 : 1), 0);

    let remaining = leftoverCount();
    while (remaining > 0) {
        type OverlapPick = {
            next: MatchableCard;
            saved: MatchableCard;
            score: number;
            idMatch: boolean;
        };
        const unambiguous: OverlapPick[] = [];

        for (const next of nextCards) {
            if (usedNext.has(next.nodeId))
                continue;
            const options: { saved: MatchableCard; score: number }[] = [];
            for (const saved of savedCards) {
                if (usedSaved.has(saved.nodeId))
                    continue;
                if (!isUnstableNodeType(next.nodeType) && !isUnstableNodeType(saved.nodeType))
                    continue;
                const score = overlapCoefficient(next.fieldNames, saved.fieldNames);
                if (score >= FIELD_OVERLAP_THRESHOLD)
                    options.push({ saved, score });
            }
            if (!options.length)
                continue;
            options.sort((a, b) => b.score - a.score);
            const top = options[0]!;
            const second = options[1];
            let chosen = top;
            if (second && top.score - second.score < FIELD_OVERLAP_MARGIN) {
                const idHits = options.filter((option) => option.saved.nodeId === next.nodeId);
                if (
                    isUnstableNodeType(next.nodeType)
                    && idHits.length === 1
                    && idHits[0]!.score >= FIELD_OVERLAP_THRESHOLD
                ) {
                    chosen = idHits[0]!;
                } else {
                    continue;
                }
            }
            unambiguous.push({
                next,
                saved: chosen.saved,
                score: chosen.score,
                idMatch: chosen.saved.nodeId === next.nodeId,
            });
        }

        if (!unambiguous.length)
            break;
        unambiguous.sort((a, b) =>
            b.score - a.score || Number(b.idMatch) - Number(a.idMatch)
        );
        const best = unambiguous[0]!;
        pair(best.saved, best.next);
        const nextRemaining = leftoverCount();
        if (nextRemaining >= remaining)
            break;
        remaining = nextRemaining;
    }

    return { savedToNext, matched: savedToNext.size };
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
        loraClipStrength: remapKeyedRecord(
            savedLayout.loraClipStrength,
            savedToNext,
            (_saved, _nextId, value) => (typeof value === 'boolean' ? value : undefined),
        ),
        loraTagMasterEnabled: remapKeyedRecord(
            savedLayout.loraTagMasterEnabled,
            savedToNext,
            (_saved, _nextId, value) => (typeof value === 'boolean' ? value : undefined),
        ),
        autocompleteSources: remapKeyedRecord(
            savedLayout.autocompleteSources,
            savedToNext,
            (_saved, _nextId, value) =>
                Array.isArray(value) && value.every((id) => typeof id === 'string')
                    ? value
                    : undefined,
        ),
        nodeSignatures: {},
    };

    return ensureBaseLayouts(remapped, orderedIds);
}

export type LayoutCandidateSource = 'saved' | 'opened';

export type SavedLayoutCandidate = {
    workflowId: string;
    cards: MatchableCard[];
    layout: SvgenLayoutState;
    /** Saved library vs an already-open session. Missing → saved. */
    source?: LayoutCandidateSource;
};

function layoutCandidateSource(candidate: SavedLayoutCandidate): LayoutCandidateSource {
    return candidate.source ?? 'saved';
}

/** Opened layouts are preferred on an equal identity match (more recently edited). */
function sourceRank(source: LayoutCandidateSource): number {
    switch (source) {
        case 'opened':
            return 1;
        case 'saved':
            return 0;
        default: {
            const _never: never = source;
            return _never;
        }
    }
}

/**
 * Pick the layout with the most identity matches (≥ 50% of next cards).
 * On an equal match, prefer an opened-session layout over a saved one.
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
        source: LayoutCandidateSource;
    } | null = null;

    for (const candidate of candidates) {
        if (!candidate.cards.length)
            continue;
        const { savedToNext, matched } = matchCardsByIdentity(nextMatchable, candidate.cards);
        const ratio = matched / nextCards.length;
        if (ratio < 0.5)
            continue;
        const source = layoutCandidateSource(candidate);
        if (
            !best
            || matched > best.matched
            || (matched === best.matched && ratio > best.ratio)
            || (
                matched === best.matched
                && ratio === best.ratio
                && sourceRank(source) > sourceRank(best.source)
            )
        ) {
            best = {
                workflowId: candidate.workflowId,
                layout: remapLayoutToCards(candidate.layout, savedToNext, nextCards),
                matched,
                ratio,
                source,
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
        const [nodeType = '', title = '', subgraphName = '', fieldBlob = ''] = signature.split('\u0000');
        out.push({
            nodeId,
            nodeType,
            title,
            subgraphName,
            fieldNames: fieldBlob ? fieldBlob.split('\u0001').filter(Boolean) : [],
        });
    }
    return out;
}
