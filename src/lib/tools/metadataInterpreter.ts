import { ComfyNode, ComfyPrompt, ComfyWorkflow, ComfyWorkflowNode } from "$lib/types";

export function getMetadataVersion(prompt: string | undefined) {
    if (/^{"\d+":/.test(prompt ?? ''))
        return 'comfy';
    if (/^{\s+"sui_image_params"/.test(prompt ?? ''))
        return 'swarm';
    return 'a1111';
}

export function getPrompts(prompt: string | undefined, workflow: string | undefined): { pos: string, neg: string; } | undefined {
    const version = getMetadataVersion(prompt);
    if (workflow)
        return getComfyPrompts(prompt, workflow);
    if (version === 'swarm')
        return getSwarmPrompts(prompt);
    return { pos: getPositivePrompt(prompt), neg: getNegativePrompt(prompt) };
}

export function getSwarmPrompts(prompt: string | undefined) {
    if (!prompt)
        return undefined;
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
        return splitPromptParams(params).join("\n")
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
export function getModel(prompt: string | undefined, workflow: string | undefined) {
    const version = getMetadataVersion(prompt);
    if (version === 'swarm' && prompt)
        return JSON.parse(prompt).sui_image_params.model;
    if (!prompt) return 'Unknown';
    let model = prompt.match(autoModelRegex)?.[1];
    if (model)
        return model;
    if (!workflow) return 'Unknown';
    const comfyPrompt = getComfyPrompt(prompt);
    const comfyWorkflow = getComfyWorkflowNodes(workflow);
    if (!comfyPrompt || !comfyWorkflow) return 'Unknown';
    model = getComfyModel(comfyPrompt, comfyWorkflow);
    if (model.includes('\n'))
        return "Multiple models";
    return model || 'Unknown';
}

export function getSeed(prompt: string | undefined, workflow: string | undefined) {
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

    return workflow.nodes.reduce((acc, node) => {
        acc[node.id] = node;
        return acc;
    }, {} as Record<string, ComfyWorkflowNode>);
}

function getComfyIds(prompt: ComfyPrompt, nodes: Record<string, ComfyWorkflowNode>, match: RegExp, ignore?: RegExp): number[] {
    const ids = [];
    for (const id in nodes) {
        if (!nodes[id].title)
            continue;
        if (match.test(nodes[id].title) && (!ignore || !ignore.test(nodes[id].title)))
            ids.push(Number(id));
    }
    if (!ids.length) {
        for (const id in nodes) {
            if (match.test(prompt[id]?.class_type) && (!ignore || !ignore.test(prompt[id]?.class_type)))
                ids.push(Number(id));
        }
    }
    return ids;
}

function getComfyValue(node: ComfyNode, keys: string | string[], type?: string) {
    if (!node)
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

export function getComfyPositive(prompt: ComfyPrompt, nodes: Record<string, ComfyWorkflowNode>) {
    let ids = getComfyIds(prompt, nodes, /positive prompt/i);
    if (!ids.length)
        ids = getComfyIds(prompt, nodes, /positive|prompt/i, /negative/i);
    const prompts = ids.map(id => getComfyValue(prompt[id], ['positive', 'prompt', 'text', 'string', 'str'], 'string')).filter(x => x);
    return !ids.length ? '' : prompts.join('\n----------\n');
}

export function getComfyNegative(prompt: ComfyPrompt, nodes: Record<string, ComfyWorkflowNode>) {
    let ids = getComfyIds(prompt, nodes, /\bnegative prompt\b/i);
    if (!ids.length)
        ids = getComfyIds(prompt, nodes, /negative/i);
    const prompts = ids.map(id => getComfyValue(prompt[id], ['negative', 'prompt', 'text', 'string', 'str'], 'string')).filter(x => x);
    return !ids.length ? '' : prompts.join('\n----------\n');
}

export function getComfyPrompts(prompt: string | ComfyPrompt | undefined, workflow: string | Record<string, ComfyWorkflowNode> | undefined): { pos: string, neg: string; } | undefined {
    if (!prompt || !workflow)
        return undefined;
    if (typeof prompt === 'string')
        prompt = getComfyPrompt(prompt);
    if (typeof workflow === 'string')
        workflow = getComfyWorkflowNodes(workflow);
    if (!prompt || !workflow)
        return undefined;
    const pos = getComfyPositive(prompt, workflow);
    const neg = getComfyNegative(prompt, workflow);
    const split = pos.split('\n---\n');
    const positive = neg ? pos : split[0];
    const negative = neg ? neg : split.length > 1 ? split[1] : '';
    if (!positive)
        return undefined;
    return { pos: positive, neg: negative };
}

export function getComfySeed(prompt: string | ComfyPrompt, nodes: string | Record<string, ComfyWorkflowNode>) {
    if (!prompt || !nodes)
        return '';
    if (typeof prompt === 'string')
        prompt = getComfyPrompt(prompt)!;
    if (typeof nodes === 'string')
        nodes = getComfyWorkflowNodes(nodes)!;
    const ids = getComfyIds(prompt, nodes, /seed/i);
    const seeds = ids.reduce((acc, id) => {
        const seed = String(getComfyValue(prompt[id], ['seed', 'number', 'int'], 'number'));
        if (seed)
            acc[id] = seed;
        return acc;
    }, {} as Record<string, string>);
    const keys = Object.keys(seeds);
    if (keys.length > 1)
        return keys.map(id => `${nodes[id].title ?? prompt[id]?.class_type}: ${seeds[id]}`).join('\n');
    return !keys.length ? '' : seeds[keys[0]];
}

export function getComfyModel(prompt: ComfyPrompt, nodes: Record<string, ComfyWorkflowNode>) {
    const ids = getComfyIds(prompt, nodes, /model|checkpoint/i);
    const models = ids.reduce((acc, id) => {
        const model = String(getComfyValue(prompt[id], ['model', 'checkpoint', 'string', 'str'], 'string'));
        if (model)
            acc[id] = model;
        return acc;
    }, {} as Record<string, string>);
    const keys = Object.keys(models);
    if (keys.length > 1)
        return keys.map(id => `${nodes[id].title ?? prompt[id]?.class_type}: ${models[id]}`).join('\n');
    return !keys.length ? '' : models[keys[0]];
}