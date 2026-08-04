import type { ComfyWorkflow } from '$lib/types/images';
import { discoverCards, setWidgetValue } from './fields';
import { forceDisableLoraTagsInText } from './loraTagText';
import type { ObjectInfoMap, SvgenLayoutState } from './types';

/**
 * For queue/convert only: when a Lora Tag Loader card's master switch is off,
 * rewrite that node's text so every tag is disabled. Session workflow / per-row
 * enables are left untouched.
 */
export function applyLoraTagMasterOverrides(
    workflow: ComfyWorkflow,
    layout: SvgenLayoutState,
    objectInfo?: ObjectInfoMap | null,
): ComfyWorkflow {
    const master = layout.loraTagMasterEnabled ?? {};
    const clipPref = layout.loraClipStrength ?? {};
    let next = workflow;

    for (const card of discoverCards(workflow, objectInfo)) {
        if (!card.loraTagLoader)
            continue;
        if (master[card.nodeId] !== false)
            continue;
        const field = card.fields.find((f) => f.kind === 'lora_tags');
        if (!field)
            continue;
        const includeClip = !!card.clipInputWired && clipPref[card.nodeId] !== false;
        const text = String(field.value ?? '');
        const forced = forceDisableLoraTagsInText(text, includeClip);
        if (forced === text)
            continue;
        next = setWidgetValue(
            next,
            card.nodeId,
            field.widgetName,
            forced,
            field.valueIndex,
            field.writeMode,
            field.innerNodeId,
            field.outerValueIndex,
        );
    }

    return next;
}
