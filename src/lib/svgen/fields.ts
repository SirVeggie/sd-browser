import type {
    ComfyProxyWidget,
    ComfySubgraphDefinition,
    ComfyWorkflow,
    ComfyWorkflowNode,
    ComfyWorkflowNodeInput,
} from '$lib/types/images';
import type {
    ObjectInfoMap,
    SvgenCard,
    SvgenCompanionWrite,
    SvgenField,
    SvgenFieldKind,
} from './types';

/**
 * Reconstructs panel fields from save-format workflow JSON.
 * Rules aligned with sv_generation_panel.js + SethRobinson widget mapping.
 */

/** control_after_generate companions only — do NOT include enable/disable (real widget values). */
const CONTROL_VALUES = new Set([
    'fixed',
    'increment',
    'decrement',
    'randomize',
]);

const IMAGE_DISPLAY_TYPES = new Set([
    'PreviewImage',
    'SV-RandomImage',
    'SV-PicsumRandomImage',
    'SV-DanbooruRandomImage',
    'SV-DanbooruSearchImage',
]);

const SD_BROWSER_NODE_TYPE = 'SV-SdBrowserImage';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SlotBuild = {
    widgetName: string;
    /**
     * object_info / inner widget name when `widgetName` is a disambiguated outer
     * alias (`value_1` → schema key still `value`).
     */
    schemaWidgetName?: string;
    label: string;
    value: string | number | boolean | null;
    /** Where to write: outer node widgets_values index, or inner node path */
    write: {
        mode: 'outer' | 'inner';
        valueIndex: number;
        innerNodeId?: string;
        innerType?: string;
        outerValueIndex?: number;
    };
    schemaType: string;
    /** widgets_values had a control_after_generate companion after this slot. */
    hadControlCompanion?: boolean;
};

function asWidgetValues(
    values: ComfyWorkflowNode['widgets_values'] | undefined,
): (string | number | boolean | null)[] {
    if (Array.isArray(values))
        return values as (string | number | boolean | null)[];
    if (values && typeof values === 'object')
        return Object.values(values) as (string | number | boolean | null)[];
    return [];
}

/** Strip control_after_generate companions (SethRobinson `_filter_control_values`). */
function filterControlValues(
    values: (string | number | boolean | null)[],
): {
    filtered: (string | number | boolean | null)[];
    originalIndex: number[];
    /** True when the following widgets_values entry was a control companion. */
    hadControlCompanion: boolean[];
} {
    const filtered: (string | number | boolean | null)[] = [];
    const originalIndex: number[] = [];
    const hadControlCompanion: boolean[] = [];
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (typeof value === 'string' && CONTROL_VALUES.has(value)) {
            if (hadControlCompanion.length)
                hadControlCompanion[hadControlCompanion.length - 1] = true;
            continue;
        }
        filtered.push(value);
        originalIndex.push(i);
        hadControlCompanion.push(false);
    }
    return { filtered, originalIndex, hadControlCompanion };
}

function resolveNodeClassType(node: ComfyWorkflowNode): string {
    const snr = node.properties?.['Node name for S&R'];
    if (typeof snr === 'string' && snr.trim())
        return snr.trim();
    return String(node.type ?? '');
}

function getProxyWidgets(node: ComfyWorkflowNode): ComfyProxyWidget[] | undefined {
    const raw = node.properties?.proxyWidgets;
    if (!Array.isArray(raw) || !raw.length)
        return undefined;
    const valid: ComfyProxyWidget[] = [];
    for (const entry of raw) {
        if (
            Array.isArray(entry)
            && entry.length >= 2
            && (typeof entry[0] === 'string' || typeof entry[0] === 'number')
            && typeof entry[1] === 'string'
        ) {
            valid.push([String(entry[0]), entry[1]]);
        }
    }
    return valid.length ? valid : undefined;
}

function findInnerNode(
    subgraph: ComfySubgraphDefinition | undefined,
    innerId: string,
): ComfyWorkflowNode | undefined {
    return subgraph?.nodes?.find((n) => String(n.id) === innerId);
}

function findInput(
    node: ComfyWorkflowNode,
    widgetName: string,
): ComfyWorkflowNodeInput | undefined {
    return (node.inputs ?? []).find(
        (input) => input.widget?.name === widgetName || input.name === widgetName,
    );
}

function isWired(node: ComfyWorkflowNode, widgetName: string): boolean {
    const input = findInput(node, widgetName);
    return input != null && input.link != null;
}

function labelFor(node: ComfyWorkflowNode, widgetName: string): string {
    const input = findInput(node, widgetName);
    const renamed = input?.label?.trim();
    if (renamed)
        return renamed;
    const localized = input?.localized_name?.trim();
    if (localized && localized !== input?.name)
        return localized;
    return widgetName;
}

function shouldHideByUnderscore(widgetName: string, label: string): boolean {
    return widgetName.startsWith('_') || label.trim().startsWith('_');
}

function isControlName(name: string, label: string): boolean {
    if (name === 'control_after_generate' || name === 'control_before_generate')
        return true;
    const lower = label.trim().toLowerCase();
    return lower === 'control after generate' || lower === 'control before generate';
}

function isCanvasName(name: string): boolean {
    return name.startsWith('$$canvas');
}

function shouldIncludeSlot(
    node: ComfyWorkflowNode,
    widgetName: string,
    label: string,
): boolean {
    if (!widgetName)
        return false;
    if (shouldHideByUnderscore(widgetName, label))
        return false;
    if (isCanvasName(widgetName))
        return false;
    if (isControlName(widgetName, label))
        return false;
    if (widgetName === 'search' && resolveNodeClassType(node) === SD_BROWSER_NODE_TYPE)
        return false;
    if (isWired(node, widgetName))
        return false;
    return true;
}

function shouldIncludeNode(node: ComfyWorkflowNode): boolean {
    if (node.flags?.collapsed)
        return false;
    const title = node.title || '';
    const type = String(node.type ?? '');
    if (title.startsWith('_') || type.startsWith('_'))
        return false;
    return true;
}

function lookupSchema(
    objectInfo: ObjectInfoMap | null | undefined,
    classType: string,
    widgetName: string,
): unknown {
    const info = objectInfo?.[classType];
    if (!info?.input)
        return undefined;
    const base = widgetName.split('.')[0];
    return info.input.required?.[widgetName]
        ?? info.input.optional?.[widgetName]
        ?? info.input.required?.[base]
        ?? info.input.optional?.[base];
}

function isWidgetSpec(spec: unknown): boolean {
    if (!Array.isArray(spec) || !spec.length)
        return false;
    const typeHint = spec[0];
    if (Array.isArray(typeHint))
        return true;
    if (typeof typeHint !== 'string')
        return false;
    if (['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'NUMBER', 'COMBO', 'IMAGE'].includes(typeHint))
        return true;
    if (typeHint.startsWith('COMFY_') && typeHint.includes('COMBO'))
        return true;
    // Custom lowercase widget types
    if (typeHint !== typeHint.toUpperCase())
        return true;
    return false;
}

/** Ordered widget slot names from object_info (includes `_` names for alignment). */
function objectInfoWidgetNames(
    objectInfo: ObjectInfoMap | null | undefined,
    classType: string,
): string[] {
    const info = objectInfo?.[classType];
    if (!info?.input)
        return [];

    const names: string[] = [];
    const seen = new Set<string>();
    const orderRequired = info.input_order?.required ?? Object.keys(info.input.required ?? {});
    const orderOptional = info.input_order?.optional ?? Object.keys(info.input.optional ?? {});

    for (const name of [...orderRequired, ...orderOptional]) {
        if (!name || seen.has(name) || isCanvasName(name))
            continue;
        const schema = lookupSchema(objectInfo, classType, name);
        if (!isWidgetSpec(schema))
            continue;
        seen.add(name);
        names.push(name);
    }
    return names;
}

function humanizeWidgetName(name: string): string {
    return name.replace(/_/g, ' ').trim();
}

function resolveLabel(node: ComfyWorkflowNode, widgetName: string): string {
    const fromInput = labelFor(node, widgetName);
    if (fromInput !== widgetName)
        return fromInput;
    return humanizeWidgetName(widgetName);
}

/** Widget-bearing input names in node order (deduped). */
function inputWidgetNames(node: ComfyWorkflowNode): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const input of node.inputs ?? []) {
        if (!input.widget)
            continue;
        const name = input.widget.name || input.name;
        if (!name || seen.has(name))
            continue;
        seen.add(name);
        names.push(name);
    }
    return names;
}

/**
 * One unique name per value slot. Prefer object_info order, but never reuse a name
 * (that was turning later checkboxes into duplicates like a second "random").
 */
function uniqueSlotNames(
    node: ComfyWorkflowNode,
    preferred: string[],
    valueCount: number,
): string[] {
    const fallbacks = inputWidgetNames(node);
    const result: string[] = [];
    const used = new Set<string>();
    let fallbackIdx = 0;

    for (let i = 0; i < valueCount; i++) {
        let candidate = preferred[i];
        if (!candidate || used.has(candidate)) {
            while (fallbackIdx < fallbacks.length && used.has(fallbacks[fallbackIdx]))
                fallbackIdx++;
            candidate = fallbackIdx < fallbacks.length
                ? fallbacks[fallbackIdx++]
                : `value_${i}`;
        }
        used.add(candidate);
        result.push(candidate);
    }
    return result;
}

function isForceInputSchema(schema: unknown): boolean {
    if (!Array.isArray(schema) || schema.length < 2)
        return false;
    const opts = schema[1];
    if (!opts || typeof opts !== 'object')
        return false;
    const record = opts as Record<string, unknown>;
    return !!(record.forceInput || record.force_input || record.defaultInput);
}

/**
 * Pick the name list that lines up 1:1 with widgets_values (positional).
 *
 * - Full list when lengths match (LLMArgs: linked `thinking` still has a stale value).
 * - Unwired when a force_input was omitted (Danbooru `seed`).
 * - Full minus linked force_inputs when a normal linked widget still occupies a
 *   slot (Resolution `base`=768) but force_input `seed` does not.
 */
function alignSlotNames(
    node: ComfyWorkflowNode,
    objectInfo: ObjectInfoMap | null | undefined,
    valueCount: number,
): string[] {
    const classType = resolveNodeClassType(node);
    const fromInfo = objectInfoWidgetNames(objectInfo, classType);
    const fromInputs = inputWidgetNames(node);
    const all = fromInfo.length ? fromInfo : fromInputs;
    const unwired = all.filter((name) => !isWired(node, name));
    const unwiredInputs = fromInputs.filter((name) => !isWired(node, name));
    const withoutForceLinked = all.filter((name) => {
        if (!isWired(node, name))
            return true;
        return !isForceInputSchema(lookupSchema(objectInfo, classType, name));
    });

    if (valueCount === all.length && all.length)
        return all;
    if (valueCount === fromInputs.length && fromInputs.length)
        return fromInputs;
    if (valueCount === unwired.length && unwired.length)
        return unwired;
    if (valueCount === unwiredInputs.length && unwiredInputs.length)
        return unwiredInputs;
    if (valueCount === withoutForceLinked.length && withoutForceLinked.length)
        return withoutForceLinked;

    const candidates = [all, fromInputs, unwired, unwiredInputs, withoutForceLinked]
        .filter((c) => c.length);
    if (!candidates.length)
        return uniqueSlotNames(node, all, valueCount);
    const best = candidates.reduce((a, b) =>
        Math.abs(a.length - valueCount) <= Math.abs(b.length - valueCount) ? a : b);
    if (best.length === valueCount)
        return best;
    return uniqueSlotNames(node, best, valueCount);
}

/**
 * Match original `widgetLabel(node, widget)`:
 * renamed widget/input label → else widget name.
 * Never use the inner node title — that single-widget/Primitive title rule must
 * not apply to subgraph proxies (LORA `PrimitiveBoolean` titled "Enable LORA"
 * would steal the label from widget rename `enabled` / name `value`).
 *
 * When several proxies share an inner widget name (`value`), Comfy promotes them
 * on the outer node as `value`, `value_1`, `value_2` with distinct labels — resolve
 * the outer name via {@link resolveOuterProxyWidgetNames}, then look up that socket.
 */
function resolveProxyLabel(
    outer: ComfyWorkflowNode,
    inner: ComfyWorkflowNode | undefined,
    outerWidgetName: string,
    innerWidgetName: string,
): string {
    const fromOuter = labelFor(outer, outerWidgetName);
    if (fromOuter !== outerWidgetName)
        return fromOuter;

    if (inner) {
        const fromInner = labelFor(inner, innerWidgetName);
        if (fromInner !== innerWidgetName)
            return fromInner;
    }

    return humanizeWidgetName(innerWidgetName);
}

function normalizeLabelKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function outerInputWidgetName(input: ComfyWorkflowNodeInput): string | undefined {
    const name = input.widget?.name || input.name;
    return name || undefined;
}

function outerInputLabelKey(input: ComfyWorkflowNodeInput): string | null {
    const label = input.label?.trim() || '';
    if (label)
        return normalizeLabelKey(label);
    const localized = input.localized_name?.trim() || '';
    if (localized && localized !== input.name)
        return normalizeLabelKey(localized);
    return null;
}

/**
 * Labels used to match a proxy onto an outer socket. Title is allowed here for
 * matching only (Sampler Steps/Start/Seed) — never as the displayed field label.
 */
function innerProxyLabelKeys(
    inner: ComfyWorkflowNode | undefined,
    innerWidgetName: string,
): string[] {
    if (!inner)
        return [];
    const keys: string[] = [];
    const seen = new Set<string>();
    const add = (raw: string | undefined) => {
        if (!raw?.trim())
            return;
        const key = normalizeLabelKey(raw);
        if (!key || seen.has(key))
            return;
        seen.add(key);
        keys.push(key);
    };
    const input = findInput(inner, innerWidgetName);
    add(input?.label);
    if (input?.localized_name && input.localized_name !== input.name)
        add(input.localized_name);
    add(inner.title);
    return keys;
}

function isDisambiguatedWidgetName(base: string, name: string): boolean {
    if (name === base)
        return true;
    if (!name.startsWith(`${base}_`))
        return false;
    return /^\d+$/.test(name.slice(base.length + 1));
}

function occurrenceOuterName(proxies: ComfyProxyWidget[], index: number): string {
    const widgetName = proxies[index]?.[1] ?? '';
    let seen = 0;
    for (let i = 0; i < index; i++) {
        if (proxies[i][1] === widgetName)
            seen++;
    }
    return seen === 0 ? widgetName : `${widgetName}_${seen}`;
}

/**
 * Resolve each proxy to Comfy's outer widget/input name.
 *
 * Duplicate inner names become `value` / `value_1` / `value_2` in *outer input
 * socket order*, which can differ from `proxyWidgets` order (Sampler lists Steps
 * before Seed, but Seed owns the wired `value` socket and Steps is `value_1`).
 * Matching by list occurrence alone hid Steps and shifted Start/Switch labels.
 */
function resolveOuterProxyWidgetNames(
    outer: ComfyWorkflowNode,
    subgraph: ComfySubgraphDefinition,
    proxies: ComfyProxyWidget[],
): string[] {
    const used = new Set<string>();
    const result: string[] = new Array(proxies.length);

    const claim = (name: string): string => {
        used.add(name);
        return name;
    };

    // Pass 1: inner label/title → outer input with the same label
    for (let i = 0; i < proxies.length; i++) {
        const [innerId, innerWidgetName] = proxies[i];
        const labelKeys = innerProxyLabelKeys(findInnerNode(subgraph, innerId), innerWidgetName);
        if (!labelKeys.length)
            continue;
        const match = (outer.inputs ?? []).find((input) => {
            const name = outerInputWidgetName(input);
            if (!name || used.has(name))
                return false;
            const outerKey = outerInputLabelKey(input);
            return !!outerKey && labelKeys.includes(outerKey);
        });
        const name = match ? outerInputWidgetName(match) : undefined;
        if (name)
            result[i] = claim(name);
    }

    // Pass 2: exact / disambiguated outer name still free (float → float_2, etc.).
    // Never take a labeled socket unless this proxy's labels agree — otherwise
    // Hires `enable` steals wired `value_4` (seed) and disappears.
    for (let i = 0; i < proxies.length; i++) {
        if (result[i])
            continue;
        const [innerId, innerWidgetName] = proxies[i];
        const labelKeys = innerProxyLabelKeys(findInnerNode(subgraph, innerId), innerWidgetName);
        const candidates = (outer.inputs ?? [])
            .filter((input) => {
                const name = outerInputWidgetName(input);
                if (!name || used.has(name))
                    return false;
                if (!isDisambiguatedWidgetName(innerWidgetName, name))
                    return false;
                const outerKey = outerInputLabelKey(input);
                if (outerKey && (!labelKeys.length || !labelKeys.includes(outerKey)))
                    return false;
                return true;
            })
            .map(outerInputWidgetName)
            .filter((name): name is string => !!name);
        const pick = candidates.find((name) => name === innerWidgetName) ?? candidates[0];
        if (pick)
            result[i] = claim(pick);
    }

    // Pass 3: no outer socket (Hires `enable`) — stable name from label, else occurrence
    for (let i = 0; i < proxies.length; i++) {
        if (result[i])
            continue;
        const [innerId, innerWidgetName] = proxies[i];
        const labelKeys = innerProxyLabelKeys(findInnerNode(subgraph, innerId), innerWidgetName);
        let candidate = (labelKeys[0] ?? '').replace(/\s+/g, '_') || occurrenceOuterName(proxies, i);
        if (!candidate)
            candidate = innerWidgetName || `proxy_${i}`;
        if (used.has(candidate)) {
            let n = 1;
            while (used.has(`${candidate}_${n}`))
                n += 1;
            candidate = `${candidate}_${n}`;
        }
        result[i] = claim(candidate);
    }

    return result;
}

/** Legacy `[[a,b], opts]` or modern `["COMBO", { options: [a,b] }]`. */
function comboValuesFromSchema(schema: unknown): string[] | undefined {
    if (!Array.isArray(schema) || !schema.length)
        return undefined;
    const [typeHint, opts] = schema as [unknown, Record<string, unknown>?];
    if (Array.isArray(typeHint))
        return typeHint.map(String);
    if (
        typeof typeHint === 'string'
        && (typeHint === 'COMBO' || typeHint.includes('COMBO'))
        && Array.isArray(opts?.options)
    ) {
        return opts.options.map(String);
    }
    return undefined;
}

function detectKind(
    classType: string,
    widgetName: string,
    value: unknown,
    schema: unknown,
): SvgenFieldKind {
    if (
        widgetName === 'image_id'
        && (classType === SD_BROWSER_NODE_TYPE || /sdbrowser|sd_browser/i.test(classType))
    ) {
        return 'sd_browser_image';
    }
    if (
        widgetName === 'image'
        && (classType === 'LoadImage' || classType === 'LoadImageMask' || classType === 'LoadImageOutput')
    ) {
        return 'image';
    }

    // Trust runtime booleans over a mismatched STRING schema (misaligned zip).
    if (typeof value === 'boolean')
        return 'boolean';

    if (
        widgetName === 'seed'
        || widgetName === 'noise_seed'
        || /:\s*seed$/i.test(widgetName)
        || /:\s*noise_seed$/i.test(widgetName)
    ) {
        return 'seed';
    }

    if (comboValuesFromSchema(schema)?.length)
        return 'combo';

    if (Array.isArray(schema)) {
        const [typeHint, opts] = schema as [unknown, Record<string, unknown>?];
        if (opts?.image_upload === true || typeHint === 'IMAGE')
            return 'image';
        if (typeHint === 'BOOLEAN' || typeHint === 'boolean')
            return 'boolean';
        if (typeHint === 'INT' || typeHint === 'FLOAT' || typeHint === 'NUMBER')
            return widgetName.toLowerCase().includes('seed') ? 'seed' : 'number';
        if (typeHint === 'STRING' || typeHint === 'string')
            return 'string';
        if (
            Array.isArray(typeHint)
            || typeHint === 'COMBO'
            || (typeof typeHint === 'string' && typeHint.includes('COMBO'))
        ) {
            return 'combo';
        }
    }

    if (typeof value === 'number')
        return widgetName.toLowerCase().includes('seed') ? 'seed' : 'number';
    if (typeof value === 'string')
        return 'string';
    return 'unknown';
}

/** Only when widgets_values had a control_after_generate companion (fixed/randomize/…). */
function supportsIntControlForSlot(
    kind: SvgenFieldKind,
    hadControlCompanion: boolean | undefined,
): boolean {
    if (kind !== 'number' && kind !== 'seed')
        return false;
    return !!hadControlCompanion;
}

function schemaOptions(schema: unknown): SvgenField['options'] {
    if (!Array.isArray(schema))
        return undefined;
    const [, opts] = schema as [unknown, Record<string, unknown>?];
    const options: SvgenField['options'] = {};
    const comboValues = comboValuesFromSchema(schema);
    if (comboValues?.length)
        options.values = comboValues;
    if (opts) {
        if (typeof opts.min === 'number')
            options.min = opts.min;
        if (typeof opts.max === 'number')
            options.max = opts.max;
        // object_info carries the real step (e.g. 64). Do NOT /10 — that scale
        // applies only to live Comfy canvas widget.options.step (legacy *10).
        // Prefer step2 when present (frontend-normalized true step).
        if (typeof opts.step2 === 'number' && opts.step2 > 0)
            options.step = opts.step2;
        else if (typeof opts.step === 'number' && opts.step > 0)
            options.step = opts.step;
        if (opts.multiline === true)
            options.multiline = true;
        if (opts.image_upload === true)
            options.imageUpload = true;
        if (opts.image_folder === 'input' || opts.image_folder === 'output' || opts.image_folder === 'temp')
            options.imageFolder = opts.image_folder;
    }
    return Object.keys(options).length ? options : undefined;
}

function companionWrite(
    slots: SlotBuild[],
    widgetName: string,
): SvgenCompanionWrite | undefined {
    const slot = slots.find((s) => s.widgetName === widgetName);
    if (!slot)
        return undefined;
    return {
        value: slot.value,
        valueIndex: slot.write.valueIndex,
        writeMode: slot.write.mode,
        innerNodeId: slot.write.innerNodeId,
    };
}

function attachSdBrowserCompanions(fields: SvgenField[], slots: SlotBuild[]): SvgenField[] {
    const search = companionWrite(slots, 'search');
    const random = companionWrite(slots, 'random');
    if (!search && !random)
        return fields;
    return fields.map((field) => {
        if (field.kind !== 'sd_browser_image')
            return field;
        return {
            ...field,
            companions: {
                search: search
                    ? { ...search, value: String(search.value ?? '') }
                    : undefined,
                random: random
                    ? { ...random, value: !!random.value }
                    : undefined,
            },
        };
    });
}

function isTallField(
    kind: SvgenFieldKind,
    options: SvgenField['options'] | undefined,
    value: unknown,
    widgetName: string,
): boolean {
    if (kind === 'sd_browser_image' || kind === 'image')
        return true;
    if (kind !== 'string')
        return false;
    if (options?.multiline)
        return true;
    const lower = widgetName.toLowerCase();
    if (lower.includes('prompt') || lower === 'text' || lower === 'string' || lower === 'input')
        return true;
    if (typeof value === 'string' && (value.includes('\n') || value.length > 80))
        return true;
    return false;
}

export function nodeSignature(node: ComfyWorkflowNode): string {
    return `${node.type}\u0000${node.title ?? ''}\u0000`;
}

export function nodeDisplayTitle(
    node: ComfyWorkflowNode,
    objectInfo?: ObjectInfoMap | null,
    subgraph?: ComfySubgraphDefinition,
): string {
    const custom = node.title?.trim();
    if (custom)
        return custom;
    if (subgraph?.name?.trim())
        return subgraph.name.trim();
    const classType = resolveNodeClassType(node);
    const display = objectInfo?.[classType]?.display_name?.trim();
    if (display)
        return display;
    return classType || `Node ${node.id}`;
}

function buildSlotsForConcreteNode(
    node: ComfyWorkflowNode,
    objectInfo: ObjectInfoMap | null | undefined,
): SlotBuild[] {
    const classType = resolveNodeClassType(node);
    const rawValues = asWidgetValues(node.widgets_values);
    const { filtered, originalIndex, hadControlCompanion } = filterControlValues(rawValues);
    if (!filtered.length && !rawValues.length)
        return [];

    const names = alignSlotNames(node, objectInfo, filtered.length);
    const aligned = zipValuesToNames(
        names,
        filtered,
        originalIndex,
        hadControlCompanion,
    );

    const slots: SlotBuild[] = [];
    for (const entry of aligned) {
        slots.push({
            widgetName: entry.name,
            label: resolveLabel(node, entry.name),
            value: entry.value,
            write: {
                mode: 'outer',
                valueIndex: entry.valueIndex,
            },
            schemaType: classType,
            hadControlCompanion: entry.hadControlCompanion,
        });
    }
    return slots;
}

function valueForInnerWidget(
    inner: ComfyWorkflowNode,
    widgetName: string,
    objectInfo: ObjectInfoMap | null | undefined,
): {
    value: string | number | boolean | null;
    valueIndex: number;
    hadControlCompanion: boolean;
} | undefined {
    const rawValues = asWidgetValues(inner.widgets_values);
    const { filtered, originalIndex, hadControlCompanion } = filterControlValues(rawValues);
    const names = alignSlotNames(inner, objectInfo, filtered.length);
    const aligned = zipValuesToNames(
        names,
        filtered,
        originalIndex,
        hadControlCompanion,
    );
    return aligned.find((entry) => entry.name === widgetName);
}

type AlignedSlotValue = {
    name: string;
    value: string | number | boolean | null;
    valueIndex: number;
    hadControlCompanion: boolean;
};

/** Positional zip: values[i] ↔ names[i]. */
function zipValuesToNames(
    names: string[],
    filtered: (string | number | boolean | null)[],
    originalIndex: number[],
    hadControlCompanion: boolean[],
): AlignedSlotValue[] {
    const n = Math.min(names.length, filtered.length);
    const out: AlignedSlotValue[] = [];
    for (let i = 0; i < n; i++) {
        out.push({
            name: names[i],
            value: filtered[i],
            valueIndex: originalIndex[i] ?? i,
            hadControlCompanion: hadControlCompanion[i] ?? false,
        });
    }
    return out;
}

/**
 * Map outer widgets_values onto unique proxyWidgets entries (positional).
 *
 * Only treat a proxy as omitted when the *outer* subgraph socket is linked.
 * Inner links to the subgraph inputNode (-10) are normal for promoted widgets.
 * Wiring checks use resolved outer names (`value_1`), not the bare inner name
 * (`value`) — otherwise one linked `value` marks every value-proxy as wired.
 */
function alignOuterProxyValues(
    node: ComfyWorkflowNode,
    proxies: ComfyProxyWidget[],
    outerNames: string[],
    outerFiltered: (string | number | boolean | null)[],
    outerOrig: number[],
    outerHadControl: boolean[],
): Map<string, {
    value: string | number | boolean | null;
    valueIndex: number;
    hadControlCompanion: boolean;
}> {
    const out = new Map<string, {
        value: string | number | boolean | null;
        valueIndex: number;
        hadControlCompanion: boolean;
    }>();
    if (!proxies.length || !outerFiltered.length)
        return out;

    const keyOf = (p: ComfyProxyWidget) => `${p[0]}:${p[1]}`;
    const allIdx = proxies.map((_, i) => i);
    const unwiredIdx = allIdx.filter((i) => !isWired(node, outerNames[i] ?? proxies[i][1]));
    const sourceIdx = (
        proxies.length === outerFiltered.length
            ? allIdx
            : unwiredIdx.length === outerFiltered.length && unwiredIdx.length
                ? unwiredIdx
                : (Math.abs(proxies.length - outerFiltered.length)
                    <= Math.abs(unwiredIdx.length - outerFiltered.length)
                    ? allIdx
                    : (unwiredIdx.length ? unwiredIdx : allIdx))
    );

    for (let i = 0; i < sourceIdx.length && i < outerFiltered.length; i++) {
        const proxy = proxies[sourceIdx[i]];
        if (!proxy)
            continue;
        out.set(keyOf(proxy), {
            value: outerFiltered[i],
            valueIndex: outerOrig[i] ?? i,
            hadControlCompanion: outerHadControl[i] ?? false,
        });
    }
    return out;
}

function defaultValueForSchema(schema: unknown): string | number | boolean | null {
    if (!Array.isArray(schema) || !schema.length)
        return null;
    const [typeHint, opts] = schema as [unknown, Record<string, unknown>?];
    if (opts && 'default' in opts) {
        const d = opts.default;
        if (
            typeof d === 'string'
            || typeof d === 'number'
            || typeof d === 'boolean'
            || d === null
        ) {
            return d;
        }
    }
    const combo = comboValuesFromSchema(schema);
    if (combo?.length)
        return combo[0];
    if (typeHint === 'BOOLEAN' || typeHint === 'boolean')
        return false;
    if (
        typeHint === 'INT'
        || typeHint === 'int'
        || typeHint === 'FLOAT'
        || typeHint === 'NUMBER'
        || typeHint === 'float'
    ) {
        return 0;
    }
    if (typeHint === 'STRING' || typeHint === 'string')
        return '';
    return null;
}

function buildSlotsForProxyNode(
    node: ComfyWorkflowNode,
    subgraph: ComfySubgraphDefinition,
    objectInfo: ObjectInfoMap | null | undefined,
): SlotBuild[] {
    const proxyWidgets = getProxyWidgets(node);
    if (!proxyWidgets?.length)
        return [];

    const outerRaw = asWidgetValues(node.widgets_values);
    const {
        filtered: outerFiltered,
        originalIndex: outerOrig,
        hadControlCompanion: outerHadControl,
    } = filterControlValues(outerRaw);

    const uniqueProxies: ComfyProxyWidget[] = [];
    const seenProxy = new Set<string>();
    for (const proxy of proxyWidgets) {
        const proxyKey = `${proxy[0]}:${proxy[1]}`;
        if (seenProxy.has(proxyKey))
            continue;
        seenProxy.add(proxyKey);
        uniqueProxies.push(proxy);
    }

    const outerNames = resolveOuterProxyWidgetNames(node, subgraph, uniqueProxies);
    const outerByProxy = alignOuterProxyValues(
        node,
        uniqueProxies,
        outerNames,
        outerFiltered,
        outerOrig,
        outerHadControl,
    );

    const slots: SlotBuild[] = [];
    for (let proxyIndex = 0; proxyIndex < uniqueProxies.length; proxyIndex++) {
        const [innerId, innerWidgetName] = uniqueProxies[proxyIndex];
        const outerWidgetName = outerNames[proxyIndex] ?? innerWidgetName;
        const proxyKey = `${innerId}:${innerWidgetName}`;
        const inner = findInnerNode(subgraph, innerId);
        const schemaType = inner ? resolveNodeClassType(inner) : resolveNodeClassType(node);
        const label = resolveProxyLabel(node, inner, outerWidgetName, innerWidgetName);
        const schema = lookupSchema(objectInfo, schemaType, innerWidgetName);
        // Outer instance values win when present; else inner definition values
        // (positional). Linked force_inputs may be omitted from inner wv.
        const innerWired = !!(inner && isWired(inner, innerWidgetName));
        const fromInner = inner
            ? valueForInnerWidget(inner, innerWidgetName, objectInfo)
            : undefined;
        const fromOuter = outerByProxy.get(proxyKey);

        let value: string | number | boolean | null | undefined;
        let hadControlCompanion = false;
        if (fromOuter) {
            value = fromOuter.value;
            hadControlCompanion = fromOuter.hadControlCompanion;
        } else if (fromInner) {
            value = fromInner.value;
            hadControlCompanion = fromInner.hadControlCompanion;
        } else {
            value = defaultValueForSchema(schema);
        }

        // Instance values live on the outer node for promoted proxies; convert still
        // needs inner updates when the definition holds a writable slot.
        // Field identity uses the disambiguated outer name so hide/order/labels
        // stay unique when several proxies share an inner widget name.
        if (fromOuter && (innerWired || !fromInner)) {
            slots.push({
                widgetName: outerWidgetName,
                schemaWidgetName: innerWidgetName,
                label,
                value,
                write: {
                    mode: 'outer',
                    valueIndex: fromOuter.valueIndex,
                    innerNodeId: fromInner ? innerId : undefined,
                    innerType: schemaType,
                    outerValueIndex: fromOuter.valueIndex,
                },
                schemaType,
                hadControlCompanion,
            });
        } else if (fromInner) {
            slots.push({
                widgetName: outerWidgetName,
                schemaWidgetName: innerWidgetName,
                label,
                value,
                write: {
                    mode: 'inner',
                    valueIndex: fromInner.valueIndex,
                    innerNodeId: innerId,
                    innerType: schemaType,
                    outerValueIndex: fromOuter?.valueIndex,
                },
                schemaType,
                hadControlCompanion,
            });
        } else if (fromOuter) {
            slots.push({
                widgetName: outerWidgetName,
                schemaWidgetName: innerWidgetName,
                label,
                value,
                write: { mode: 'outer', valueIndex: fromOuter.valueIndex },
                schemaType,
                hadControlCompanion,
            });
        } else {
            // No stored value index — still surface the promoted widget (schema default).
            slots.push({
                widgetName: outerWidgetName,
                schemaWidgetName: innerWidgetName,
                label,
                value,
                write: {
                    mode: 'outer',
                    valueIndex: -1,
                    innerNodeId: inner ? innerId : undefined,
                    innerType: schemaType,
                },
                schemaType,
                hadControlCompanion,
            });
        }
    }
    return slots;
}

function slotsToFields(
    node: ComfyWorkflowNode,
    slots: SlotBuild[],
    objectInfo: ObjectInfoMap | null | undefined,
    /** For wire checks on proxy fields, use inner node when available */
    wireNode: ComfyWorkflowNode = node,
): SvgenField[] {
    const fields: SvgenField[] = [];
    for (const slot of slots) {
        if (!shouldIncludeSlot(wireNode, slot.widgetName, slot.label))
            continue;
        // Also hide if outer container wires the same name
        if (wireNode !== node && isWired(node, slot.widgetName))
            continue;

        const schemaName = slot.schemaWidgetName ?? slot.widgetName;
        const schema = lookupSchema(objectInfo, slot.schemaType, schemaName);
        const kind = detectKind(slot.schemaType, schemaName, slot.value, schema);
        let options = schemaOptions(schema);
        if (kind === 'string') {
            const lower = schemaName.toLowerCase();
            if (
                !options?.multiline
                && (lower.includes('prompt') || lower === 'text' || lower === 'string' || lower === 'input')
            ) {
                options = { ...(options ?? {}), multiline: true };
            }
        }

        fields.push({
            nodeId: String(node.id),
            nodeType: slot.schemaType,
            nodeTitle: node.title || '',
            widgetName: slot.widgetName,
            label: slot.label,
            kind,
            value: slot.value,
            options,
            valueIndex: slot.write.valueIndex,
            tall: isTallField(kind, options, slot.value, schemaName),
            writeMode: slot.write.mode,
            innerNodeId: slot.write.innerNodeId,
            outerValueIndex: slot.write.outerValueIndex,
            supportsIntControl: supportsIntControlForSlot(
                kind,
                slot.hadControlCompanion,
            ),
        });
    }
    return attachSdBrowserCompanions(fields, slots);
}

export function discoverCards(
    workflow: ComfyWorkflow,
    objectInfo?: ObjectInfoMap | null,
): SvgenCard[] {
    const subgraphsByType = new Map<string, ComfySubgraphDefinition>();
    for (const subgraph of workflow.definitions?.subgraphs ?? [])
        subgraphsByType.set(subgraph.id, subgraph);

    const cards: SvgenCard[] = [];

    for (const node of workflow.nodes ?? []) {
        if (!node || node.id === undefined || node.id === null)
            continue;
        if (!shouldIncludeNode(node))
            continue;

        const subgraph = subgraphsByType.get(String(node.type));
        const proxyWidgets = getProxyWidgets(node);
        const title = nodeDisplayTitle(node, objectInfo, subgraph);

        let fields: SvgenField[] = [];
        if (proxyWidgets && subgraph) {
            const slots = buildSlotsForProxyNode(node, subgraph, objectInfo);
            // Wire-check against the *outer* subgraph node only. Inner links to the
            // subgraph inputNode are normal for promoted widgets and must not hide them.
            fields = [];
            for (const slot of slots) {
                if (!shouldIncludeSlot(node, slot.widgetName, slot.label))
                    continue;
                const schemaName = slot.schemaWidgetName ?? slot.widgetName;
                const schema = lookupSchema(objectInfo, slot.schemaType, schemaName);
                const kind = detectKind(slot.schemaType, schemaName, slot.value, schema);
                let options = schemaOptions(schema);
                if (kind === 'string') {
                    const lower = schemaName.toLowerCase();
                    if (
                        !options?.multiline
                        && (lower.includes('prompt') || lower === 'text' || lower === 'string' || lower === 'input')
                    ) {
                        options = { ...(options ?? {}), multiline: true };
                    }
                }
                fields.push({
                    nodeId: String(node.id),
                    nodeType: slot.schemaType,
                    nodeTitle: title,
                    widgetName: slot.widgetName,
                    label: slot.label,
                    kind,
                    value: slot.value,
                    options,
                    valueIndex: slot.write.valueIndex,
                    tall: isTallField(kind, options, slot.value, schemaName),
                    writeMode: slot.write.mode,
                    innerNodeId: slot.write.innerNodeId,
                    outerValueIndex: slot.write.outerValueIndex,
                    supportsIntControl: supportsIntControlForSlot(
                        kind,
                        slot.hadControlCompanion,
                    ),
                });
            }
            fields = attachSdBrowserCompanions(fields, slots);
        } else if (!UUID_RE.test(String(node.type))) {
            fields = slotsToFields(node, buildSlotsForConcreteNode(node, objectInfo), objectInfo);
            for (const f of fields)
                f.nodeTitle = title;
        } else if (subgraph && !proxyWidgets) {
            // UUID subgraph without proxyWidgets — nothing editable on the shell
            fields = [];
        }

        const isImageDisplay = IMAGE_DISPLAY_TYPES.has(resolveNodeClassType(node))
            || IMAGE_DISPLAY_TYPES.has(String(node.type));

        if (!fields.length && !isImageDisplay)
            continue;

        cards.push({
            nodeId: String(node.id),
            nodeType: resolveNodeClassType(node),
            title,
            fields,
            imageDisplay: isImageDisplay,
        });
    }

    return cards;
}

function patchNodeWidgetValue(
    node: ComfyWorkflowNode,
    value: string | number | boolean | null,
    index: number,
): ComfyWorkflowNode | null {
    if (index < 0)
        return null;
    const values = asWidgetValues(node.widgets_values);
    if (index < values.length && values[index] === value)
        return null;
    const next = values.slice();
    while (next.length <= index)
        next.push(null);
    next[index] = value;
    return { ...node, widgets_values: next };
}

export function setWidgetValue(
    workflow: ComfyWorkflow,
    nodeId: string,
    widgetName: string,
    value: string | number | boolean | null,
    valueIndex?: number,
    writeMode?: 'outer' | 'inner',
    innerNodeId?: string,
    outerValueIndex?: number,
): ComfyWorkflow {
    const mode = writeMode ?? 'outer';
    let nextWorkflow = workflow;

    if (mode === 'inner' && innerNodeId) {
        const outer = (nextWorkflow.nodes ?? []).find((n) => String(n.id) === nodeId);
        const subgraphId = outer ? String(outer.type) : '';
        if (nextWorkflow.definitions) {
            let changed = false;
            const subgraphs = (nextWorkflow.definitions.subgraphs ?? []).map((subgraph) => {
                if (subgraphId && subgraph.id !== subgraphId)
                    return subgraph;
                let subgraphChanged = false;
                const nodes = (subgraph.nodes ?? []).map((inner) => {
                    if (String(inner.id) !== innerNodeId)
                        return inner;
                    const patched = patchNodeWidgetValue(
                        inner,
                        value,
                        typeof valueIndex === 'number' ? valueIndex : -1,
                    );
                    if (!patched)
                        return inner;
                    subgraphChanged = true;
                    changed = true;
                    return patched;
                });
                return subgraphChanged ? { ...subgraph, nodes } : subgraph;
            });

            if (changed) {
                nextWorkflow = {
                    ...nextWorkflow,
                    definitions: { ...nextWorkflow.definitions, subgraphs },
                };
            }
        }

        // Keep instance proxy widgets_values in sync when we know the outer index.
        if (typeof outerValueIndex === 'number' && outerValueIndex >= 0) {
            let outerChanged = false;
            const nodes = (nextWorkflow.nodes ?? []).map((node) => {
                if (String(node.id) !== nodeId)
                    return node;
                const patched = patchNodeWidgetValue(node, value, outerValueIndex);
                if (!patched)
                    return node;
                outerChanged = true;
                return patched;
            });
            if (outerChanged)
                nextWorkflow = { ...nextWorkflow, nodes };
        }

        return nextWorkflow;
    }

    let changed = false;
    const nodes = (nextWorkflow.nodes ?? []).map((node) => {
        if (String(node.id) !== nodeId)
            return node;
        let index = typeof valueIndex === 'number' ? valueIndex : -1;
        if (index < 0) {
            const slots = buildSlotsForConcreteNode(node, null);
            index = slots.find((s) => s.widgetName === widgetName)?.write.valueIndex ?? -1;
        }
        const patched = patchNodeWidgetValue(node, value, index);
        if (!patched)
            return node;
        changed = true;
        return patched;
    });

    return changed ? { ...nextWorkflow, nodes } : nextWorkflow;
}

export function applyFieldOrderAndHidden(
    cards: SvgenCard[],
    fieldOrder: Record<string, string[]>,
    hiddenFields: Record<string, string[]>,
): SvgenCard[] {
    return cards.map((card) => {
        const hidden = new Set(hiddenFields[card.nodeId] ?? []);
        const order = fieldOrder[card.nodeId];
        let fields = card.fields.filter((f) => !hidden.has(f.widgetName));
        if (order?.length) {
            const rank = new Map(order.map((name, i) => [name, i]));
            fields = [...fields].sort((a, b) => {
                const ra = rank.get(a.widgetName) ?? 9999;
                const rb = rank.get(b.widgetName) ?? 9999;
                return ra - rb;
            });
        }
        return { ...card, fields };
    }).filter((card) => card.fields.length > 0 || card.imageDisplay);
}
