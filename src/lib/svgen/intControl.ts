import type { ComfyWorkflow } from '$lib/types/images';
import { setWidgetValue } from './fields';
import type { IntControlMode, SvgenCard, SvgenField } from './types';

export const INT_CONTROL_MODES = [
    'fixed',
    'increment',
    'decrement',
    'randomize',
] as const satisfies readonly IntControlMode[];

export const INT_CONTROL_MODE_LABELS: Record<IntControlMode, string> = {
    fixed: 'Fixed',
    increment: 'Increment',
    decrement: 'Decrement',
    randomize: 'Randomize',
};

const PRECISE_MAX = 1_000_000_000_000_000 - 1;

export function isIntControlMode(value: unknown): value is IntControlMode {
    return value === 'fixed'
        || value === 'increment'
        || value === 'decrement'
        || value === 'randomize';
}

export function normalizeIntControlModes(
    value: unknown,
): Record<string, IntControlMode> {
    const out: Record<string, IntControlMode> = {};
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return out;
    for (const [key, mode] of Object.entries(value)) {
        if (typeof key === 'string' && isIntControlMode(mode))
            out[key] = mode;
    }
    return out;
}

export function intControlModeKey(field: Pick<SvgenField, 'nodeId' | 'widgetName' | 'innerNodeId'>): string {
    return field.innerNodeId
        ? `${field.nodeId}:${field.innerNodeId}:${field.widgetName}`
        : `${field.nodeId}:${field.widgetName}`;
}

export function getIntControlMode(
    modes: Record<string, IntControlMode>,
    field: Pick<SvgenField, 'nodeId' | 'widgetName' | 'innerNodeId'>,
): IntControlMode {
    return modes[intControlModeKey(field)] ?? 'randomize';
}

function intControlValueBounds(field: SvgenField): { min: number; max: number } {
    const rawMin = field.options?.min;
    const rawMax = field.options?.max;
    let min = rawMin != null && Number.isFinite(rawMin) ? rawMin : 0;
    let max = rawMax != null && Number.isFinite(rawMax) ? rawMax : 2048;

    if (max > PRECISE_MAX) {
        max = PRECISE_MAX;
        min = Math.max(min, 0);
        if (min > max)
            min = 0;
    }

    return { min, max };
}

function intFieldStep(field: SvgenField): number {
    const step = field.options?.step;
    return typeof step === 'number' && step > 0 ? step : 1;
}

export function computeNextIntControlValue(
    field: SvgenField,
    mode: IntControlMode,
): string | number | boolean | null {
    const { min, max } = intControlValueBounds(field);
    const step = intFieldStep(field);
    const range = Math.max(0, (max - min) / step);

    let next = Number(field.value);
    if (Number.isNaN(next))
        return field.value;

    switch (mode) {
        case 'fixed':
            return field.value;
        case 'increment':
            next += step;
            break;
        case 'decrement':
            next -= step;
            break;
        case 'randomize':
            next = range > 0
                ? Math.floor(Math.random() * (range + 1)) * step + min
                : min;
            break;
        default: {
            const _exhaustive: never = mode;
            return _exhaustive;
        }
    }

    next = Math.min(Math.max(next, min), max);
    return Math.round(next);
}

export function intControlFieldsFromCards(cards: SvgenCard[]): SvgenField[] {
    const out: SvgenField[] = [];
    for (const card of cards) {
        for (const field of card.fields) {
            if (field.supportsIntControl)
                out.push(field);
        }
    }
    return out;
}

export function captureLastUsedSeeds(
    cards: SvgenCard[],
    lastUsed: Map<string, number>,
): void {
    for (const field of intControlFieldsFromCards(cards)) {
        const value = Number(field.value);
        if (Number.isNaN(value))
            continue;
        lastUsed.set(intControlModeKey(field), value);
    }
}

/**
 * After a successful queue, advance INT/seed widgets according to their
 * control-after-generate mode (skips frozen keys).
 */
export function applyIntControlsAfterQueue(
    workflow: ComfyWorkflow,
    cards: SvgenCard[],
    modes: Record<string, IntControlMode>,
    frozen: ReadonlySet<string>,
): ComfyWorkflow {
    let next = workflow;
    for (const field of intControlFieldsFromCards(cards)) {
        const key = intControlModeKey(field);
        if (frozen.has(key))
            continue;
        const mode = getIntControlMode(modes, field);
        const nextValue = computeNextIntControlValue(field, mode);
        if (nextValue === field.value)
            continue;
        next = setWidgetValue(
            next,
            field.nodeId,
            field.widgetName,
            nextValue,
            field.valueIndex,
            field.writeMode,
            field.innerNodeId,
            field.outerValueIndex,
        );
    }
    return next;
}
