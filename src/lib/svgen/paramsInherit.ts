import type { ComfyWorkflow } from '$lib/types/images';
import { discoverCards, setWidgetValue } from './fields';
import {
    matchCardsByIdentity,
    matchableFromCards,
    remapFieldName,
} from './layoutInherit';
import type { ObjectInfoMap, SvgenCard, SvgenField, SvgenFieldKind } from './types';

export type ApplyParamsResult = {
    workflow: ComfyWorkflow;
    matchedCards: number;
    /** Fields whose value actually changed. */
    changedFields: number;
    /** Fields successfully matched and applied (including unchanged values). */
    setFields: number;
    /** Total exposed fields on the current (target) workflow. */
    totalFields: number;
};

function kindsCompatible(source: SvgenFieldKind, target: SvgenFieldKind): boolean {
    if (source === target)
        return true;
    if (
        (source === 'seed' && target === 'number')
        || (source === 'number' && target === 'seed')
    ) {
        return true;
    }
    if (
        (source === 'string' && target === 'combo')
        || (source === 'combo' && target === 'string')
    ) {
        return true;
    }
    return false;
}

function valuesEqual(
    a: string | number | boolean | null,
    b: string | number | boolean | null,
): boolean {
    return a === b;
}

function writeFieldValue(
    workflow: ComfyWorkflow,
    field: SvgenField,
    value: string | number | boolean | null,
): ComfyWorkflow {
    return setWidgetValue(
        workflow,
        field.nodeId,
        field.widgetName,
        value,
        field.valueIndex,
        field.writeMode,
        field.innerNodeId,
        field.outerValueIndex,
    );
}

function writeCompanion(
    workflow: ComfyWorkflow,
    field: SvgenField,
    widgetName: string,
    companion: NonNullable<SvgenField['companions']>['search'],
    value: string | number | boolean | null,
): ComfyWorkflow {
    if (!companion)
        return workflow;
    return setWidgetValue(
        workflow,
        field.nodeId,
        widgetName,
        value,
        companion.valueIndex,
        companion.writeMode,
        companion.innerNodeId ?? field.innerNodeId,
    );
}

function countFields(cards: readonly SvgenCard[]): number {
    let total = 0;
    for (const card of cards)
        total += card.fields.length;
    return total;
}

/**
 * Copy exposed field values from source cards onto the target workflow.
 * Card matching reuses layout inheritance identity rules (best match wins;
 * ambiguous type/title-only matches are skipped). Only discovered UI fields
 * are written — graph links and non-exposed widgets are left alone.
 */
export function applyParamsFromCards(args: {
    sourceCards: readonly SvgenCard[];
    targetCards: readonly SvgenCard[];
    targetWorkflow: ComfyWorkflow;
}): ApplyParamsResult {
    const { savedToNext, matched } = matchCardsByIdentity(
        matchableFromCards(args.targetCards),
        matchableFromCards(args.sourceCards),
    );

    const sourceById = new Map(args.sourceCards.map((card) => [card.nodeId, card]));
    const targetById = new Map(args.targetCards.map((card) => [card.nodeId, card]));
    const totalFields = countFields(args.targetCards);

    let workflow = args.targetWorkflow;
    let changedFields = 0;
    let setFields = 0;

    for (const [sourceNodeId, targetNodeId] of savedToNext) {
        const sourceCard = sourceById.get(sourceNodeId);
        const targetCard = targetById.get(targetNodeId);
        if (!sourceCard || !targetCard)
            continue;

        const targetNames = targetCard.fields.map((field) => field.widgetName);
        const usedTarget = new Set<string>();

        for (const sourceField of sourceCard.fields) {
            const mappedName = remapFieldName(sourceField.widgetName, targetNames);
            if (!mappedName || usedTarget.has(mappedName))
                continue;
            const targetField = targetCard.fields.find((field) => field.widgetName === mappedName);
            if (!targetField)
                continue;
            if (!kindsCompatible(sourceField.kind, targetField.kind))
                continue;

            usedTarget.add(mappedName);

            if (valuesEqual(sourceField.value, targetField.value)) {
                setFields += 1;
            } else {
                const next = writeFieldValue(workflow, targetField, sourceField.value);
                if (next !== workflow) {
                    workflow = next;
                    changedFields += 1;
                    setFields += 1;
                }
            }

            // Keep SD Browser search/random companions in sync with the image_id value.
            if (sourceField.companions?.search && targetField.companions?.search) {
                const value = sourceField.companions.search.value;
                if (!valuesEqual(value, targetField.companions.search.value)) {
                    const next = writeCompanion(
                        workflow,
                        targetField,
                        'search',
                        targetField.companions.search,
                        value,
                    );
                    if (next !== workflow)
                        workflow = next;
                }
            }
            if (sourceField.companions?.random && targetField.companions?.random) {
                const value = sourceField.companions.random.value;
                if (!valuesEqual(value, targetField.companions.random.value)) {
                    const next = writeCompanion(
                        workflow,
                        targetField,
                        'random',
                        targetField.companions.random,
                        value,
                    );
                    if (next !== workflow)
                        workflow = next;
                }
            }
        }
    }

    return {
        workflow,
        matchedCards: matched,
        changedFields,
        setFields,
        totalFields,
    };
}

/**
 * Discover exposed cards on both workflows, then copy matching UI values onto the target.
 */
export function applyParamsFromWorkflow(args: {
    sourceWorkflow: ComfyWorkflow;
    targetWorkflow: ComfyWorkflow;
    objectInfo: ObjectInfoMap | null;
}): ApplyParamsResult {
    return applyParamsFromCards({
        sourceCards: discoverCards(args.sourceWorkflow, args.objectInfo),
        targetCards: discoverCards(args.targetWorkflow, args.objectInfo),
        targetWorkflow: args.targetWorkflow,
    });
}
