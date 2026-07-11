import type {
    ComfyMetadataField,
    ComfyMetadataSection,
    ComfyNode,
    ComfyPrompt,
    ComfyProxyWidget,
    ComfySubgraphDefinition,
    ComfyWorkflow,
    ComfyWorkflowNode,
    ComfyWorkflowNodeInput,
    ModelCandidate,
    ServerImage,
} from "$lib/types/images";

export function simplifyPrompt(image: ServerImage | undefined): string {
    if (!image)
        return '';
    return `${image.positive}\n${image.negative}\n` + image.params
        .replace(/(, )?seed: \d+/i, '')
        .replace(/(, )?([^,]*)version: [^,]*/ig, '');
}

export function similarityPromptText(image: ServerImage | undefined): string {
    if (!image)
        return '';
    return `${image.positive}\n${image.negative}`;
}

export function getMetadataVersion(prompt: string | undefined) {
    if (/^{"\d+":/.test(prompt ?? ''))
        return 'comfy';
    if (/^{\s*"sui_image_params"/.test(prompt ?? ''))
        return 'swarm';
    return 'a1111';
}

export function getPrompts(prompt: string | undefined, workflow: string | undefined, extra: string | undefined, og = false): { pos: string, neg: string, params?: string, ogpos?: string, ogneg?: string; } | undefined {
    let res: { pos: string, neg: string, params?: string, ogpos?: string, ogneg?: string; };
    const get = () => {
        if (res) return res;
        const version = getMetadataVersion(prompt);
        if (version === 'comfy' && workflow) {
            const comfy = getComfyPrompts(prompt, workflow) ?? { pos: '', neg: '' };
            res = { ...comfy, params: getComfyMetadataParamsText(prompt, workflow) };
        } else if (workflow)
            res = getComfyPrompts(prompt, workflow) ?? { pos: '', neg: '' };
        else if (version === 'swarm')
            res = { ...getSwarmPrompts(prompt), params: getParams(prompt) };
        else
            res = { pos: getPositivePrompt(prompt), neg: getNegativePrompt(prompt), params: getParams(prompt) };
        return res;
    };

    if (extra) {
        try {
            const custom = JSON.parse(extra);
            const parts = (custom.prompt as string)?.split(/[\n\r,]+ ?-{3,}[\n\r,]+/) ?? [];
            if (custom.prompt || custom.positive) {
                const pos: string = custom.positive || parts[0] || custom.prompt;
                const neg: string = custom.negative || parts[1];
                const params = custom.params ? `${custom.params}\n\n${get().params}` : get().params;
                return {
                    pos: pos.trim() || get().pos,
                    neg: neg.trim() || get().neg,
                    ogpos: (pos && og) ? get().pos : undefined,
                    ogneg: (neg && og) ? get().neg : undefined,
                    params,
                };
            }
        } catch { /**/ }
    }

    return get();
}

export function getSwarmPrompts(prompt: string | undefined): { pos: string, neg: string; } {
    if (!prompt)
        return { pos: '', neg: '' };
    const data = JSON.parse(prompt);
    return { pos: data.sui_image_params.prompt, neg: data.sui_image_params.negativeprompt };
}

export function getSwarmSeed(prompt: string | undefined) {
    if (!prompt)
        return '';
    const data = JSON.parse(prompt);
    return data.sui_image_params.seed;
}

const positiveRegex = /^([\s\S]*?)\n\r?(Negative prompt:|.*$)/;
export function getPositivePrompt(prompt: string | undefined) {
    if (!prompt) return '';
    return positiveRegex.exec(prompt)?.[1] ?? '';
}

const negativeRegex = /\n\r?Negative prompt: ([\s\S]*?)\n\r?Steps: \d+[\s\S]*$/;
export function getNegativePrompt(prompt: string | undefined) {
    if (!prompt) return '';
    return negativeRegex.exec(prompt)?.[1] ?? '';
}

const svPositiveRegex = /sv_prompt: ("([^"]|(?<=\\)")*"|[^,"]*)/;
export function getSvPositivePrompt(prompt: string | undefined) {
    if (!prompt) return '';
    let res = svPositiveRegex.exec(prompt)?.[1] ?? '';
    if (res[0] === '"')
        res = JSON.parse(res);
    return res;
}

const svNegativeRegex = /sv_negative: ("([^"]|(?<=\\)")*"|[^,"]*)/;
export function getSvNegativePrompt(prompt: string | undefined) {
    if (!prompt) return '';
    let res = svNegativeRegex.exec(prompt)?.[1] ?? '';
    if (res[0] === '"')
        res = JSON.parse(res);
    return res;
}

const paramsRegex = /\n\r?(Steps: \d+[\s\S]*)$/;
export function getParams(prompt: string | undefined) {
    const version = getMetadataVersion(prompt);
    if (version === 'swarm' && prompt)
        return Object.entries(JSON.parse(prompt).sui_image_params).map(([key, value]) => `${key}: ${value}`).join('\n');
    if (!prompt) return '';
    const params = paramsRegex.exec(prompt)?.[1] ?? '';
    if (params)
        return splitPromptParams(params).join("\n");
    return '';
}

export function splitPromptParams(str: string): string[] {
    const res: string[] = [];
    let prev = 0;
    let inQuotes = false;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '"' && str[i - 1] !== '\\') {
            inQuotes = !inQuotes;
        } else if (str[i] === ',' && !inQuotes) {
            res.push(str.slice(prev, i).trim());
            prev = i + 1;
        }
    }
    res.push(str.slice(prev).trim());
    const hiddenParams = ["sv_prompt", "sv_negative"];
    return res.filter(s => !hiddenParams.includes(s.split(":")[0].trim()));
}

const autoModelRegex = /Model: (.*?)(,|$)/;
const PRIMARY_EXCLUDE_RE = /vae|clip|encoder|depth|adapter|ipa|control/i;

export const UNKNOWN_MODEL = 'Unknown';
export const MULTIPLE_MODELS = 'Multiple models';

function parseExtraJson(extra: string | undefined): Record<string, unknown> | undefined {
    if (!extra)
        return undefined;
    try {
        return JSON.parse(extra) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

function isModelFilename(value: string): boolean {
    return /\.(safetensors|gguf|pt)$/i.test(value);
}

export function normalizeModelFilename(name: string): string {
    return name.replace(/\\+/g, '\\').trim();
}

function addUniqueName(names: Set<string>, name: string | undefined) {
    const trimmed = name?.trim();
    if (trimmed)
        names.add(trimmed);
}

function getExplicitModelNames(extra: string | undefined, prompt: string | undefined): string[] {
    const names = new Set<string>();
    const data = parseExtraJson(extra);
    if (typeof data?.model === 'string')
        addUniqueName(names, data.model);

    if (typeof data?.params === 'string') {
        const modelFromParams = /(?:^|[\n\r,])\s*model:\s*([^,\n\r]+)/i.exec(data.params)?.[1];
        addUniqueName(names, modelFromParams);
    }

    const version = getMetadataVersion(prompt);
    if (version === 'swarm' && prompt) {
        try {
            const model = JSON.parse(prompt).sui_image_params?.model;
            if (typeof model === 'string')
                addUniqueName(names, model);
        } catch { /**/ }
    }

    if (prompt) {
        const a1111Model = prompt.match(autoModelRegex)?.[1];
        addUniqueName(names, a1111Model);
    }

    return [...names];
}

function getExplicitPrimaryModel(extra: string | undefined): string | undefined {
    const data = parseExtraJson(extra);
    if (typeof data?.model === 'string' && data.model.trim())
        return data.model.trim();

    if (typeof data?.params === 'string') {
        const modelFromParams = /(?:^|[\n\r,])\s*model:\s*([^,\n\r]+)/i.exec(data.params)?.[1]?.trim();
        if (modelFromParams)
            return modelFromParams;
    }

    return undefined;
}

export function getModels(prompt: string | undefined, workflow: string | undefined, extra: string | undefined): string {
    return formatModels(getModelCandidates(prompt, workflow, extra));
}

function loraContextText(candidate: ModelCandidate): string {
    return [
        candidate.nodeTitle,
        candidate.className,
        candidate.widgetLabel,
        candidate.inputKey,
    ].filter(Boolean).join(' ');
}

function isLoraCandidate(candidate: ModelCandidate): boolean {
    return /lora/i.test(loraContextText(candidate));
}

function getCandidateSortRank(candidate: ModelCandidate): number {
    if (isLoraCandidate(candidate))
        return 4;
    if (isExcludedFromPrimary(candidate))
        return 5;

    const title = (candidate.nodeTitle ?? '').toLowerCase();
    const className = (candidate.className ?? '').toLowerCase();
    const widget = (candidate.widgetLabel ?? '').toLowerCase();
    const inputKey = (candidate.inputKey ?? '').toLowerCase();

    if (/checkpoint/.test(title) || /checkpoint/.test(className)
        || widget === 'ckpt_name' || widget === 'checkpoint'
        || inputKey === 'ckpt_name' || inputKey === 'checkpoint')
        return 0;
    if (/diffusion|model/.test(title) || /diffusion|model/.test(className))
        return 1;
    if (widget === 'model' || inputKey === 'model')
        return 2;

    const ext = candidate.model.split('.').pop()?.toLowerCase();
    if (ext === 'safetensors' || ext === 'gguf')
        return 3;
    if (ext === 'pt')
        return 6;
    return 7;
}

export function sortModelCandidates(candidates: ModelCandidate[]): ModelCandidate[] {
    return [...candidates].sort((a, b) => {
        const rank = getCandidateSortRank(a) - getCandidateSortRank(b);
        if (rank !== 0)
            return rank;
        return a.model.localeCompare(b.model);
    });
}

function candidateContextText(candidate: ModelCandidate): string {
    return [
        candidate.nodeTitle,
        candidate.className,
        candidate.widgetLabel,
        candidate.inputKey,
        candidate.model,
    ].filter(Boolean).join(' ');
}

function isExcludedFromPrimary(candidate: ModelCandidate): boolean {
    return PRIMARY_EXCLUDE_RE.test(candidateContextText(candidate));
}

function collectComfyModelCandidates(prompt: ComfyPrompt, ctx: ComfyWorkflowContext): ModelCandidate[] {
    const candidates: ModelCandidate[] = [];
    const seen = new Set<string>();

    const add = (model: string, info: Omit<ModelCandidate, 'model'>) => {
        const normalized = normalizeModelFilename(model);
        if (!isModelFilename(normalized))
            return;
        const key = `${info.nodeId ?? ''}:${normalized}:${info.inputKey ?? ''}`;
        if (seen.has(key))
            return;
        seen.add(key);
        candidates.push({ model: normalized, ...info });
    };

    for (const id in prompt) {
        const promptNode = prompt[id];
        const workflowNode = ctx.nodes[id];
        const subgraph = workflowNode ? getSubgraphDefinition(ctx, workflowNode) : undefined;
        const nodeTitle = resolveNodeTitle(id, promptNode, workflowNode, subgraph);
        const className = promptNode.class_type ?? workflowNode?.type ?? '';

        for (const [inputKey, value] of Object.entries(promptNode.inputs ?? {})) {
            if (typeof value !== 'string' || !isModelFilename(value))
                continue;
            const input = findWorkflowInput(workflowNode, inputKey);
            const widgetLabel = input ? resolveInputLabel(input, inputKey) : inputKey;
            add(value, { nodeId: id, nodeTitle, className, inputKey, widgetLabel });
        }
    }

    for (const workflowNode of ctx.workflow.nodes ?? []) {
        const proxyWidgets = getProxyWidgets(workflowNode);
        if (!proxyWidgets)
            continue;
        const subgraph = getSubgraphDefinition(ctx, workflowNode);
        const containerTitle = resolveNodeTitle(
            workflowNode.id,
            prompt[String(workflowNode.id)],
            workflowNode,
            subgraph,
        );
        for (const [innerId, widgetName] of proxyWidgets) {
            const promptNode = prompt[`${workflowNode.id}:${innerId}`];
            const value = promptNode?.inputs?.[widgetName];
            if (typeof value !== 'string' || !isModelFilename(value))
                continue;
            const innerNode = findInnerNode(subgraph, innerId);
            const widgetLabel = resolveProxyWidgetLabel(subgraph, innerId, widgetName);
            add(value, {
                nodeId: `${workflowNode.id}:${innerId}`,
                nodeTitle: innerNode?.title ?? containerTitle,
                className: innerNode?.type ?? workflowNode.type,
                inputKey: widgetName,
                widgetLabel,
            });
        }
    }

    return candidates;
}

function collectExplicitModelCandidates(
    extra: string | undefined,
    prompt: string | undefined,
): ModelCandidate[] {
    const candidates: ModelCandidate[] = [];
    const seen = new Set<string>();

    const add = (model: string, info: Omit<ModelCandidate, 'model'> = {}) => {
        const normalized = normalizeModelFilename(model);
        if (!normalized || !isModelFilename(normalized) || seen.has(normalized))
            return;
        seen.add(normalized);
        candidates.push({ model: normalized, ...info });
    };

    for (const name of getExplicitModelNames(extra, prompt))
        add(name);

    return candidates;
}

export function getModelCandidates(
    prompt: string | undefined,
    workflow: string | undefined,
    extra: string | undefined,
): ModelCandidate[] {
    const version = getMetadataVersion(prompt);

    if (version === 'comfy' && prompt && workflow) {
        const comfyPrompt = getComfyPrompt(prompt);
        const ctx = getComfyWorkflowContext(workflow);
        if (comfyPrompt && ctx) {
            const candidates = collectComfyModelCandidates(comfyPrompt, ctx);
            const seen = new Set(candidates.map(candidate => normalizeModelFilename(candidate.model)));
            for (const name of getExplicitModelNames(extra, prompt)) {
                const normalized = normalizeModelFilename(name);
                if (!normalized || !isModelFilename(normalized) || seen.has(normalized))
                    continue;
                candidates.push({ model: normalized });
                seen.add(normalized);
            }
            return sortModelCandidates(candidates);
        }
    }

    return sortModelCandidates(collectExplicitModelCandidates(extra, prompt));
}

export function getPrimaryModel(candidates: ModelCandidate[], extra: string | undefined): string {
    const explicit = getExplicitPrimaryModel(extra);
    if (explicit)
        return explicit;

    if (!candidates.length)
        return UNKNOWN_MODEL;

    const eligible = candidates.filter(candidate => !isLoraCandidate(candidate));
    const uniqueNames = [...new Set(eligible.map(candidate => candidate.model))];
    if (uniqueNames.length === 1)
        return uniqueNames[0];
    if (!uniqueNames.length)
        return UNKNOWN_MODEL;

    let pool = eligible.filter(candidate => !candidate.model.toLowerCase().endsWith('.pt'));
    pool = pool.filter(candidate => !isExcludedFromPrimary(candidate));

    const withMain = pool.filter(candidate => /main/i.test(candidate.nodeTitle ?? ''));
    if (withMain.length === 1)
        return withMain[0].model;
    if (withMain.length > 1)
        pool = withMain;

    const withFirst = pool.filter(candidate => /first/i.test(candidate.nodeTitle ?? ''));
    if (withFirst.length === 1)
        return withFirst[0].model;
    if (withFirst.length > 1)
        pool = withFirst;

    const remainingNames = [...new Set(pool.map(candidate => candidate.model))];
    if (remainingNames.length === 1)
        return remainingNames[0];

    return MULTIPLE_MODELS;
}

export function formatModels(candidates: ModelCandidate[]): string {
    return sortModelCandidates(candidates).map(candidate => {
        const label = candidate.nodeTitle || candidate.className || candidate.widgetLabel || candidate.inputKey;
        return label ? `${label}: ${candidate.model}` : candidate.model;
    }).join('\n');
}

export function getModelSearchText(models: string | undefined): string {
    return (models ?? '').replace(/\\/g, '/');
}

export function getSeed(prompt: string | undefined, workflow: string | undefined, extra: string | undefined) {
    if (extra) {
        try {
            const data = JSON.parse(extra);
            if (data.seed) {
                return data.seed;
            }
        } catch { /**/ }
    }
    const version = getMetadataVersion(prompt);
    if (!prompt)
        return '';
    if (version === 'swarm')
        return getSwarmSeed(prompt);
    if (version === 'a1111')
        return /seed: (\d+)/i.exec(prompt)?.[1] || '';
    if (!workflow)
        return '';
    return getComfySeed(prompt, workflow) || '';
}

const autoHashRegex = /Model hash: (.*?)(,|$)/;
export function getModelHash(prompt: string | undefined) {
    if (!prompt) return '';
    return prompt.match(autoHashRegex)?.[1] || '';
}

export function getComfyPrompt(prompt: string): ComfyPrompt | undefined {
    if (!prompt)
        return undefined;
    // Comfy metadata can contain invalid JSON
    prompt = prompt.replace(/(?<!")NaN(?!")/g, 'null');
    try {
        return JSON.parse(prompt);
    } catch (e) {
        console.error(e);
        return undefined;
    }
}

export function getComfyWorkflow(workflow: string): ComfyWorkflow | undefined {
    if (!workflow)
        return undefined;
    try {
        return JSON.parse(workflow);
    } catch (e) {
        console.error(e);
        return undefined;
    }
}

export function getComfyWorkflowNodes(workflow: string | ComfyWorkflow | undefined): Record<string, ComfyWorkflowNode> | undefined {
    if (!workflow)
        return undefined;
    if (typeof workflow === 'string') {
        try {
            workflow = JSON.parse(workflow) as ComfyWorkflow;
        } catch (e) {
            console.error(e);
            return {};
        }
    }

    return (workflow.nodes ?? []).reduce((acc, node) => {
        acc[node.id] = node;
        return acc;
    }, {} as Record<string, ComfyWorkflowNode>);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEM_PROMPT_RE = /system prompt/i;
const SEED_RE = /\bseed\b/i;
const TEXT_INPUT_KEYS = new Set(['text', 'str', 'string', 'value']);
const REFINE_PROMPT_RE = /refine prompt/i;
const PROMPT_PART_SEPARATOR_RE = /\n-{3,}\n/;
const PARAMS_TEXT_PREVIEW_KEYWORDS = ['show', 'display', 'preview'] as const;
const PARAMS_TEXT_PREVIEW_OMIT_MIN_LENGTH = 100;
const PARAMS_TEXT_MAX_STRING_LENGTH = 1000;

type ComfySeedEntry = {
    label: string;
    value: string;
    priority: number;
};

type ComfyFieldContext = {
    workflowNode?: ComfyWorkflowNode;
    innerNode?: ComfyWorkflowNode;
};

type ComfyWorkflowContext = {
    workflow: ComfyWorkflow;
    nodes: Record<string, ComfyWorkflowNode>;
    subgraphsByType: Map<string, ComfySubgraphDefinition>;
};

function getComfyWorkflowContext(workflow: string | ComfyWorkflow | undefined): ComfyWorkflowContext | undefined {
    if (!workflow)
        return undefined;
    if (typeof workflow === 'string')
        workflow = getComfyWorkflow(workflow);
    if (!workflow)
        return undefined;
    const nodes = getComfyWorkflowNodes(workflow);
    if (!nodes)
        return undefined;
    const subgraphsByType = new Map<string, ComfySubgraphDefinition>();
    for (const subgraph of workflow.definitions?.subgraphs ?? [])
        subgraphsByType.set(subgraph.id, subgraph);
    return { workflow, nodes, subgraphsByType };
}

function getPromptNodeTitle(node: ComfyNode | undefined): string {
    return node?._meta?.title ?? '';
}

function resolveWorkflowNodeTitle(
    node: ComfyWorkflowNode,
    ctx: ComfyWorkflowContext | undefined,
): string {
    if (node.title)
        return node.title;
    const subgraph = ctx ? getSubgraphDefinition(ctx, node) : undefined;
    return subgraph?.name ?? '';
}

function isPositivePromptTitle(title: string): boolean {
    if (!title || SYSTEM_PROMPT_RE.test(title) || REFINE_PROMPT_RE.test(title))
        return false;
    if (/negative/i.test(title))
        return false;
    return /positive/i.test(title) || /prompt/i.test(title);
}

function isNegativePromptTitle(title: string): boolean {
    if (!title || SYSTEM_PROMPT_RE.test(title))
        return false;
    return /negative/i.test(title);
}

function collectNumericLiteralFields(
    promptNode: ComfyNode | undefined,
    workflowNode: ComfyWorkflowNode | undefined,
): { label: string; value: number; inputKey: string; }[] {
    if (!promptNode?.inputs)
        return [];
    const results: { label: string; value: number; inputKey: string; }[] = [];
    for (const [key, value] of Object.entries(promptNode.inputs)) {
        if (typeof value !== 'number' || !Number.isFinite(value))
            continue;
        results.push({
            label: resolveLiteralLabel(workflowNode, key),
            value,
            inputKey: key,
        });
    }
    return results;
}

function asWidgetValues(
    values: ComfyWorkflowNode['widgets_values'] | undefined,
): (string | number | boolean | null)[] {
    if (Array.isArray(values))
        return values;
    if (values && typeof values === 'object')
        return Object.values(values) as (string | number | boolean | null)[];
    return [];
}

function isComfyProxyWidget(entry: unknown): entry is [string | number, string] {
    return Array.isArray(entry)
        && entry.length >= 2
        && (typeof entry[0] === 'string' || typeof entry[0] === 'number')
        && typeof entry[1] === 'string';
}

function collectNumericWidgetValues(node: ComfyWorkflowNode): number[] {
    const values: number[] = [];
    for (const value of asWidgetValues(node.widgets_values)) {
        if (typeof value === 'number' && Number.isFinite(value))
            values.push(value);
    }
    return values;
}

function isLiteralInput(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isCollapsed(node: ComfyWorkflowNode | undefined): boolean {
    return node?.flags?.collapsed === true;
}

function isSubgraphContainer(node: ComfyWorkflowNode): boolean {
    return getProxyWidgets(node) !== undefined || UUID_RE.test(node.type);
}

function getProxyWidgets(node: ComfyWorkflowNode): ComfyProxyWidget[] | undefined {
    const proxyWidgets = node.properties?.proxyWidgets;
    if (!Array.isArray(proxyWidgets) || !proxyWidgets.length)
        return undefined;
    const valid = proxyWidgets
        .filter(isComfyProxyWidget)
        .map(([innerId, widgetName]): ComfyProxyWidget => [String(innerId), widgetName]);
    if (!valid.length)
        return undefined;
    return valid;
}

function getSubgraphDefinition(ctx: ComfyWorkflowContext, node: ComfyWorkflowNode): ComfySubgraphDefinition | undefined {
    return ctx.subgraphsByType.get(node.type);
}

function resolveNodeTitle(
    nodeId: string | number,
    promptNode: ComfyNode | undefined,
    workflowNode: ComfyWorkflowNode | undefined,
    subgraph?: ComfySubgraphDefinition,
): string {
    if (workflowNode?.title)
        return workflowNode.title;
    const metaTitle = getPromptNodeTitle(promptNode);
    if (metaTitle)
        return metaTitle;
    if (subgraph?.name)
        return subgraph.name;
    if (workflowNode?.type)
        return workflowNode.type;
    return promptNode?.class_type ?? String(nodeId);
}

function resolveSeedEntryLabel(
    nodeId: string | number,
    promptNode: ComfyNode | undefined,
    workflowNode: ComfyWorkflowNode | undefined,
    ctx: ComfyWorkflowContext | undefined,
): string {
    const subgraph = workflowNode && ctx ? getSubgraphDefinition(ctx, workflowNode) : undefined;
    const title = resolveNodeTitle(nodeId, promptNode, workflowNode, subgraph).trim();
    if (title)
        return title;
    return workflowNode?.type?.trim() || promptNode?.class_type?.trim() || String(nodeId);
}

function getSeedEntryPriority(nodeLabel: string, widgetLabel?: string, inputKey?: string): number {
    const normalizedTitle = nodeLabel.trim().toLowerCase();
    if (normalizedTitle.startsWith('seed'))
        return 0;
    if (/seed/i.test(nodeLabel))
        return 1;
    if ((widgetLabel && /seed/i.test(widgetLabel)) || (inputKey && /seed/i.test(inputKey)))
        return 2;
    return 3;
}

function sortComfySeedEntries(entries: ComfySeedEntry[]): ComfySeedEntry[] {
    return [...entries].sort((a, b) => a.priority - b.priority);
}

function formatComfySeedEntries(entries: ComfySeedEntry[]): string {
    const sorted = sortComfySeedEntries(entries);
    if (!sorted.length)
        return '';
    if (sorted.length === 1)
        return sorted[0].value;
    return sorted.map(entry => `${entry.label}: ${entry.value}`).join('\n');
}

function resolveInputLabel(input: ComfyWorkflowNodeInput | undefined, fallback: string): string {
    if (!input)
        return fallback;
    if (input.label)
        return input.label;
    if (input.localized_name && input.localized_name !== input.name)
        return input.localized_name;
    if (input.widget?.name && input.widget.name !== input.name)
        return input.widget.name;
    return fallback;
}

function findWorkflowInput(node: ComfyWorkflowNode | undefined, key: string): ComfyWorkflowNodeInput | undefined {
    return node?.inputs?.find(input => input.name === key || input.widget?.name === key);
}

function findInnerNode(subgraph: ComfySubgraphDefinition | undefined, innerId: string): ComfyWorkflowNode | undefined {
    if (!subgraph)
        return undefined;
    const numericId = Number(innerId);
    return subgraph.nodes?.find(node => node.id === numericId);
}

function resolveProxyWidgetLabel(
    subgraph: ComfySubgraphDefinition | undefined,
    innerId: string,
    widgetName: string,
): string {
    const innerNode = findInnerNode(subgraph, innerId);
    if (!innerNode)
        return widgetName;
    if (widgetName === 'value' && innerNode.title)
        return innerNode.title;
    const input = findWorkflowInput(innerNode, widgetName);
    return resolveInputLabel(input, innerNode.title ?? widgetName);
}

function resolveLiteralLabel(workflowNode: ComfyWorkflowNode | undefined, key: string): string {
    const input = findWorkflowInput(workflowNode, key);
    if (input)
        return resolveInputLabel(input, key);
    if (key === 'value' && workflowNode?.title)
        return workflowNode.title;
    return key;
}

type ComfyMetadataSectionDraft = {
    title: string;
    fields: ComfyMetadataField[];
    fieldContexts: ComfyFieldContext[];
    nodeId?: number;
};

type ComfyMetadataFieldWithContext = {
    field: ComfyMetadataField;
    context: ComfyFieldContext;
};

function getLiteralFieldsWithContext(
    promptNode: ComfyNode,
    workflowNode: ComfyWorkflowNode | undefined,
): ComfyMetadataFieldWithContext[] {
    if (!promptNode.inputs)
        return [];
    const results: ComfyMetadataFieldWithContext[] = [];
    for (const [key, value] of Object.entries(promptNode.inputs)) {
        if (!isLiteralInput(value))
            continue;
        results.push({
            field: {
                label: resolveLiteralLabel(workflowNode, key),
                value,
                inputKey: key,
            },
            context: { workflowNode },
        });
    }
    return results.sort((a, b) => {
        const keyA = a.field.inputKey ?? a.field.label;
        const keyB = b.field.inputKey ?? b.field.label;
        return keyA.localeCompare(keyB);
    });
}

function getPromotedSubgraphFieldsWithContext(
    containerId: number,
    containerNode: ComfyWorkflowNode,
    prompt: ComfyPrompt,
    subgraph: ComfySubgraphDefinition | undefined,
): ComfyMetadataFieldWithContext[] {
    const proxyWidgets = getProxyWidgets(containerNode);
    if (!proxyWidgets)
        return [];
    const results: ComfyMetadataFieldWithContext[] = [];
    for (const [innerId, widgetName] of proxyWidgets) {
        const promptNode = prompt[`${containerId}:${innerId}`];
        if (!promptNode?.inputs)
            continue;
        const value = promptNode.inputs[widgetName];
        if (!isLiteralInput(value))
            continue;
        const innerNode = findInnerNode(subgraph, innerId);
        results.push({
            field: {
                label: resolveProxyWidgetLabel(subgraph, innerId, widgetName),
                value,
                inputKey: widgetName,
            },
            context: { workflowNode: containerNode, innerNode },
        });
    }
    return results.sort((a, b) => {
        const keyA = a.field.inputKey ?? a.field.label;
        const keyB = b.field.inputKey ?? b.field.label;
        return keyA.localeCompare(keyB);
    });
}

function draftToSection(
    title: string,
    items: ComfyMetadataFieldWithContext[],
    nodeId?: number,
): ComfyMetadataSectionDraft {
    return {
        title,
        fields: items.map(item => item.field),
        fieldContexts: items.map(item => item.context),
        nodeId,
    };
}

function resolveNodeClassName(context: ComfyFieldContext): string {
    return context.innerNode?.type ?? context.workflowNode?.type ?? '';
}

function containsParamsTextPreviewKeyword(text: string): boolean {
    const lower = text.toLowerCase();
    return PARAMS_TEXT_PREVIEW_KEYWORDS.some(keyword => lower.includes(keyword));
}

function shouldOmitFromParamsText(
    field: ComfyMetadataField,
    context: ComfyFieldContext,
    sectionTitle: string,
): boolean {
    if (typeof field.value !== 'string')
        return false;
    if (field.value.length > PARAMS_TEXT_MAX_STRING_LENGTH)
        return true;
    if (field.value.length < PARAMS_TEXT_PREVIEW_OMIT_MIN_LENGTH)
        return false;
    const className = resolveNodeClassName(context);
    return containsParamsTextPreviewKeyword(sectionTitle)
        || (!!className && containsParamsTextPreviewKeyword(className));
}

function filterSectionDraftForParamsText(
    draft: ComfyMetadataSectionDraft,
    excludedPromptValues: Set<string>,
    seedValues: Set<string>,
): ComfyMetadataSection | undefined {
    const fields: ComfyMetadataField[] = [];
    for (let i = 0; i < draft.fields.length; i++) {
        const field = draft.fields[i];
        const context = draft.fieldContexts[i];
        if (shouldExcludeMetadataField(field, excludedPromptValues, seedValues, context))
            continue;
        if (shouldOmitFromParamsText(field, context, draft.title))
            continue;
        fields.push(field);
    }
    if (!fields.length)
        return undefined;
    return { title: draft.title, fields, nodeId: draft.nodeId };
}

function filterSectionDraft(
    draft: ComfyMetadataSectionDraft,
    excludedPromptValues: Set<string>,
    seedValues: Set<string>,
): ComfyMetadataSection | undefined {
    const fields: ComfyMetadataField[] = [];
    for (let i = 0; i < draft.fields.length; i++) {
        const field = draft.fields[i];
        const context = draft.fieldContexts[i];
        if (!shouldExcludeMetadataField(field, excludedPromptValues, seedValues, context))
            fields.push(field);
    }
    if (!fields.length)
        return undefined;
    return { title: draft.title, fields, nodeId: draft.nodeId };
}

function buildComfyMetadataSectionDrafts(
    prompt: ComfyPrompt,
    ctx: ComfyWorkflowContext,
): ComfyMetadataSectionDraft[] {
    const drafts: ComfyMetadataSectionDraft[] = [];
    const sortedNodes = [...(ctx.workflow.nodes ?? [])].sort((a, b) => a.id - b.id);

    for (const workflowNode of sortedNodes) {
        const proxyWidgets = getProxyWidgets(workflowNode);
        if (proxyWidgets) {
            const subgraph = getSubgraphDefinition(ctx, workflowNode);
            const items = getPromotedSubgraphFieldsWithContext(workflowNode.id, workflowNode, prompt, subgraph);
            if (!items.length)
                continue;
            drafts.push(draftToSection(
                resolveNodeTitle(workflowNode.id, prompt[String(workflowNode.id)], workflowNode, subgraph),
                items,
                workflowNode.id,
            ));
            continue;
        }

        if (isSubgraphContainer(workflowNode))
            continue;

        if (isCollapsed(workflowNode))
            continue;

        const promptNode = prompt[String(workflowNode.id)];
        if (!promptNode)
            continue;

        const items = getLiteralFieldsWithContext(promptNode, workflowNode);
        if (!items.length)
            continue;

        drafts.push(draftToSection(
            resolveNodeTitle(workflowNode.id, promptNode, workflowNode),
            items,
            workflowNode.id,
        ));
    }

    return drafts;
}

function finalizeComfyMetadataSections(
    drafts: ComfyMetadataSectionDraft[],
    excludedPromptValues: Set<string>,
    seedValues: Set<string>,
    forParamsText: boolean,
): ComfyMetadataSection[] {
    const filter = forParamsText ? filterSectionDraftForParamsText : filterSectionDraft;
    const sections = drafts
        .map(draft => filter(draft, excludedPromptValues, seedValues))
        .filter((section): section is ComfyMetadataSection => !!section);
    return sortComfyMetadataSections(sections);
}

function isWhitespaceString(value: string | number | boolean): boolean {
    return typeof value === 'string' && !value.trim();
}

function isSeedLikeInteger(value: number): boolean {
    return String(Math.abs(Math.trunc(value))).length > 4;
}

function shouldTreatAsSeed(
    nodeLabel: string,
    value: number,
    widgetLabel?: string,
    inputKey?: string,
): boolean {
    if (SEED_RE.test(nodeLabel))
        return true;
    if (widgetLabel && SEED_RE.test(widgetLabel))
        return true;
    if (inputKey && SEED_RE.test(inputKey))
        return true;
    if (isSeedLikeInteger(value))
        return true;
    return false;
}

function isPromptLikeField(field: ComfyMetadataField): boolean {
    return isPositivePromptTitle(field.label) || isNegativePromptTitle(field.label);
}

function isPromptLikeNode(context: ComfyFieldContext): boolean {
    for (const node of [context.innerNode, context.workflowNode]) {
        const title = node?.title;
        if (!title)
            continue;
        if (isPositivePromptTitle(title) || isNegativePromptTitle(title))
            return true;
    }
    return false;
}

function shouldExcludeMetadataField(
    field: ComfyMetadataField,
    excludedPromptValues: Set<string>,
    seedValues: Set<string>,
    context: ComfyFieldContext = {},
): boolean {
    if (isWhitespaceString(field.value))
        return true;
    if (isPromptLikeField(field) || isPromptLikeNode(context))
        return true;
    if (typeof field.value === 'string' && excludedPromptValues.has(field.value.trim()))
        return true;
    if (isSeedLikeField(field, seedValues, context))
        return true;
    return false;
}

function isSeedLikeField(
    field: ComfyMetadataField,
    seedValues: Set<string>,
    context: ComfyFieldContext = {},
): boolean {
    const valueStr = String(field.value);
    if (seedValues.has(valueStr))
        return true;
    if (SEED_RE.test(field.label))
        return true;
    if (field.inputKey && SEED_RE.test(field.inputKey))
        return true;
    if (typeof field.value === 'number' && isSeedLikeInteger(field.value))
        return true;
    return false;
}

function collectComfySeedEntries(
    prompt: ComfyPrompt,
    ctx: ComfyWorkflowContext | undefined,
    nodes: Record<string, ComfyWorkflowNode>,
): ComfySeedEntry[] {
    const entries: ComfySeedEntry[] = [];
    const seen = new Set<string>();

    const add = (
        nodeLabel: string,
        value: string | number,
        widgetLabel?: string,
        inputKey?: string,
    ) => {
        const normalized = String(value);
        if (!normalized || seen.has(normalized))
            return;
        seen.add(normalized);
        entries.push({
            label: nodeLabel,
            value: normalized,
            priority: getSeedEntryPriority(nodeLabel, widgetLabel, inputKey),
        });
    };

    for (const id of getComfyIds(prompt, nodes, SEED_RE)) {
        const workflowNode = nodes[id];
        const nodeLabel = resolveSeedEntryLabel(id, prompt[id], workflowNode, ctx);
        for (const field of collectNumericLiteralFields(prompt[id], workflowNode)) {
            if (shouldTreatAsSeed(nodeLabel, field.value, field.label, field.inputKey))
                add(nodeLabel, field.value, field.label, field.inputKey);
        }
    }

    for (const id in prompt) {
        const promptNode = prompt[id];
        const workflowNode = nodes[id];
        const nodeLabel = resolveSeedEntryLabel(id, promptNode, workflowNode, ctx);
        for (const field of collectNumericLiteralFields(promptNode, workflowNode)) {
            if (shouldTreatAsSeed(nodeLabel, field.value, field.label, field.inputKey))
                add(nodeLabel, field.value, field.label, field.inputKey);
        }
    }

    if (!ctx)
        return entries;

    const collectFromWorkflowNode = (node: ComfyWorkflowNode) => {
        const nodeLabel = resolveSeedEntryLabel(node.id, prompt[String(node.id)], node, ctx);
        for (const value of collectNumericWidgetValues(node)) {
            if (shouldTreatAsSeed(nodeLabel, value))
                add(nodeLabel, value);
        }
    };

    for (const node of ctx.workflow.nodes ?? [])
        collectFromWorkflowNode(node);

    for (const subgraph of ctx.subgraphsByType.values()) {
        for (const node of subgraph.nodes ?? [])
            collectFromWorkflowNode(node);
    }

    return entries;
}

function collectComfySeedValues(
    prompt: ComfyPrompt,
    ctx: ComfyWorkflowContext | undefined,
    nodes: Record<string, ComfyWorkflowNode>,
): Set<string> {
    return new Set(collectComfySeedEntries(prompt, ctx, nodes).map(entry => entry.value));
}

function isLongTextSection(section: ComfyMetadataSection): boolean {
    return section.fields.some(field => {
        if (typeof field.value !== 'string')
            return false;
        if (field.value.trim().length <= 20)
            return false;
        const key = field.inputKey?.toLowerCase() ?? '';
        return TEXT_INPUT_KEYS.has(key);
    });
}

function compareComfyMetadataSectionNodeId(a: ComfyMetadataSection, b: ComfyMetadataSection): number {
    const idA = a.nodeId ?? Number.MAX_SAFE_INTEGER;
    const idB = b.nodeId ?? Number.MAX_SAFE_INTEGER;
    return idA - idB;
}

function sortComfyMetadataSections(sections: ComfyMetadataSection[]): ComfyMetadataSection[] {
    const longText = sections.filter(isLongTextSection).sort(compareComfyMetadataSectionNodeId);
    const rest = sections.filter(section => !isLongTextSection(section)).sort(compareComfyMetadataSectionNodeId);
    return [...longText, ...rest];
}

export function getComfyMetadataSections(
    prompt: string | ComfyPrompt | undefined,
    workflow: string | ComfyWorkflow | undefined,
): ComfyMetadataSection[] {
    if (!prompt || !workflow)
        return [];
    if (typeof prompt === 'string')
        prompt = getComfyPrompt(prompt);
    const ctx = getComfyWorkflowContext(workflow);
    if (!prompt || !ctx)
        return [];

    const excludedPromptValues = collectExcludedPromptValues(prompt, ctx);
    const seedValues = collectComfySeedValues(prompt, ctx, ctx.nodes);
    const drafts = buildComfyMetadataSectionDrafts(prompt, ctx);
    return finalizeComfyMetadataSections(drafts, excludedPromptValues, seedValues, false);
}

function formatComfyMetadataSections(sections: ComfyMetadataSection[]): string {
    return sections.map(section => {
        const lines = section.fields.map(field => `${field.label}: ${field.value}`);
        return `${section.title}\n${lines.join('\n')}`;
    }).join('\n\n');
}

export function getComfyMetadataParamsText(
    prompt: string | ComfyPrompt | undefined,
    workflow: string | ComfyWorkflow | undefined,
): string {
    if (!prompt || !workflow)
        return '';
    if (typeof prompt === 'string')
        prompt = getComfyPrompt(prompt);
    const ctx = getComfyWorkflowContext(workflow);
    if (!prompt || !ctx)
        return '';

    const excludedPromptValues = collectExcludedPromptValues(prompt, ctx);
    const seedValues = collectComfySeedValues(prompt, ctx, ctx.nodes);
    const drafts = buildComfyMetadataSectionDrafts(prompt, ctx);
    const sections = finalizeComfyMetadataSections(drafts, excludedPromptValues, seedValues, true);
    return formatComfyMetadataSections(sections);
}

function getComfyPromptIdsByTitle(
    prompt: ComfyPrompt,
    nodes: Record<string, ComfyWorkflowNode>,
    ctx: ComfyWorkflowContext | undefined,
    matchesTitle: (title: string) => boolean,
): string[] {
    const ids: string[] = [];

    for (const id in prompt) {
        const title = getPromptNodeTitle(prompt[id]);
        if (title && matchesTitle(title))
            ids.push(id);
    }

    for (const id in nodes) {
        const key = String(id);
        if (ids.includes(key))
            continue;
        const title = resolveWorkflowNodeTitle(nodes[key], ctx);
        if (title && matchesTitle(title))
            ids.push(key);
    }

    return ids;
}

function getComfyPromptIds(prompt: ComfyPrompt, match: RegExp, ignore?: RegExp): string[] {
    const ids: string[] = [];
    for (const id in prompt) {
        const title = getPromptNodeTitle(prompt[id]);
        if (!title)
            continue;
        if (match.test(title) && (!ignore || !ignore.test(title)))
            ids.push(id);
    }
    return ids;
}

function getComfyIds(prompt: ComfyPrompt, nodes: Record<string, ComfyWorkflowNode>, match: RegExp, ignore?: RegExp): string[] {
    const ids = getComfyPromptIds(prompt, match, ignore);
    for (const id in nodes) {
        if (!nodes[id].title)
            continue;
        const key = String(id);
        if (ids.includes(key))
            continue;
        if (match.test(nodes[id].title!) && (!ignore || !ignore.test(nodes[id].title!)))
            ids.push(key);
    }
    for (const id in nodes) {
        const key = String(id);
        if (ids.includes(key))
            continue;
        if (match.test(prompt[key]?.class_type) && (!ignore || !ignore.test(prompt[key]?.class_type)))
            ids.push(key);
    }
    return ids;
}

function getComfyValue(node: ComfyNode | undefined, keys: string | string[], type?: string) {
    if (!node?.inputs)
        return '';
    let types = [];
    if (type)
        types = [type];
    else
        types = ['string', 'number', 'boolean'];
    if (!Array.isArray(keys))
        keys = [keys];
    keys = keys.map(key => key.toLowerCase());
    for (const key of keys) {
        if (key in node.inputs && types.includes(typeof node.inputs[key]))
            return node.inputs[key];
    }
    if (Object.keys(node.inputs).length === 1 && types.includes(typeof Object.values(node.inputs)[0]))
        return Object.values(node.inputs)[0];
    return '';
}

export function getComfyPositive(
    prompt: ComfyPrompt,
    nodes: Record<string, ComfyWorkflowNode>,
    ctx?: ComfyWorkflowContext,
) {
    const ids = getComfyPromptIdsByTitle(prompt, nodes, ctx, isPositivePromptTitle);
    const prompts = ids.map(id => getComfyValue(prompt[id], ['positive', 'prompt', 'text', 'string', 'str', 'value'], 'string')).filter(x => x);
    return !ids.length ? '' : prompts.join('\n----------\n');
}

export function getComfyNegative(
    prompt: ComfyPrompt,
    nodes: Record<string, ComfyWorkflowNode>,
    ctx?: ComfyWorkflowContext,
) {
    const ids = getComfyPromptIdsByTitle(prompt, nodes, ctx, isNegativePromptTitle);
    const prompts = ids.map(id => getComfyValue(prompt[id], ['negative', 'prompt', 'text', 'string', 'str', 'value'], 'string')).filter(x => x);
    return !ids.length ? '' : prompts.join('\n----------\n');
}

function collectExcludedPromptValues(prompt: ComfyPrompt, ctx: ComfyWorkflowContext): Set<string> {
    const values = new Set<string>();
    const addParts = (text: string) => {
        for (const part of text.split(PROMPT_PART_SEPARATOR_RE)) {
            const normalized = part.trim();
            if (normalized)
                values.add(normalized);
        }
    };
    addParts(getComfyPositive(prompt, ctx.nodes, ctx));
    addParts(getComfyNegative(prompt, ctx.nodes, ctx));
    return values;
}

function isComfyWorkflow(workflow: ComfyWorkflow | Record<string, ComfyWorkflowNode>): workflow is ComfyWorkflow {
    return 'nodes' in workflow && Array.isArray(workflow.nodes);
}

function normalizeWorkflowNodes(workflow: string | ComfyWorkflow | Record<string, ComfyWorkflowNode> | undefined): Record<string, ComfyWorkflowNode> | undefined {
    if (!workflow)
        return undefined;
    if (typeof workflow === 'string')
        return getComfyWorkflowNodes(workflow);
    if (isComfyWorkflow(workflow))
        return getComfyWorkflowNodes(workflow);
    return workflow;
}

export function getComfyPrompts(prompt: string | ComfyPrompt | undefined, workflow: string | ComfyWorkflow | Record<string, ComfyWorkflowNode> | undefined): { pos: string, neg: string; } | undefined {
    if (!prompt || !workflow)
        return undefined;
    if (typeof prompt === 'string')
        prompt = getComfyPrompt(prompt);
    const ctx = typeof workflow === 'string' || isComfyWorkflow(workflow)
        ? getComfyWorkflowContext(workflow)
        : undefined;
    workflow = normalizeWorkflowNodes(workflow);
    if (!prompt || !workflow)
        return undefined;
    const pos = getComfyPositive(prompt, workflow, ctx);
    const neg = getComfyNegative(prompt, workflow, ctx);
    const split = pos.split('\n---\n');
    const positive = neg ? pos : split[0];
    const negative = neg ? neg : split.length > 1 ? split[1] : '';
    if (!positive)
        return undefined;
    return { pos: positive, neg: negative };
}

export function getComfySeed(prompt: string | ComfyPrompt, workflow: string | ComfyWorkflow | Record<string, ComfyWorkflowNode>) {
    if (!prompt || !workflow)
        return '';
    if (typeof prompt === 'string')
        prompt = getComfyPrompt(prompt)!;
    const nodes = normalizeWorkflowNodes(workflow);
    if (!nodes)
        return '';
    const ctx = getComfyWorkflowContext(
        typeof workflow === 'string' || isComfyWorkflow(workflow) ? workflow : undefined,
    );
    const entries = collectComfySeedEntries(prompt, ctx, nodes);
    return formatComfySeedEntries(entries);
}
