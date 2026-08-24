/**
 * Uncommitted number edits (LoRA strength, …) live in the DOM until blur.
 * Queue/convert must read those values onto a workflow *snapshot* — never
 * dispatch `change` / write the session store, or the focused field refreshes
 * and loses caret/focus.
 */

import type { ComfyWorkflow } from '$lib/types/images';
import { setWidgetValue } from './fields';

export type PendingWidgetWrite = {
    nodeId: string;
    widgetName: string;
    value: string | number | boolean | null;
    valueIndex?: number;
    writeMode?: 'outer' | 'inner';
    innerNodeId?: string;
    outerValueIndex?: number;
};

type PendingPeek = () => PendingWidgetWrite | PendingWidgetWrite[] | null | undefined;

const peekers = new Set<PendingPeek>();

export function registerPendingFieldPeek(peek: PendingPeek): () => void {
    peekers.add(peek);
    return () => {
        peekers.delete(peek);
    };
}

export function collectPendingFieldWrites(): PendingWidgetWrite[] {
    const writes: PendingWidgetWrite[] = [];
    for (const peek of [...peekers]) {
        const result = peek();
        if (result == null)
            continue;
        if (Array.isArray(result))
            writes.push(...result);
        else
            writes.push(result);
    }
    return writes;
}

/** Apply live field values to a copy used for convert/submit only. */
export function applyPendingFieldWrites(workflow: ComfyWorkflow): ComfyWorkflow {
    let next = workflow;
    for (const write of collectPendingFieldWrites()) {
        next = setWidgetValue(
            next,
            write.nodeId,
            write.widgetName,
            write.value,
            write.valueIndex,
            write.writeMode,
            write.innerNodeId,
            write.outerValueIndex,
        );
    }
    return next;
}
