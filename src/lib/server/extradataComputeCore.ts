import { getModels, getPrompts, simplifyPrompt } from '$lib/tools/metadataInterpreter';
import type { ImageExtraData, ServerImage, ServerImageFull } from '$lib/types/images';
import crypto from 'crypto';

function hashPromptFields(fields: Pick<ServerImage, 'positive' | 'negative' | 'params'>): string {
    const prompt = simplifyPrompt(fields as ServerImage);
    if (!prompt)
        return '';
    const hash = crypto.createHash('sha256');
    hash.update(prompt);
    return hash.digest('base64');
}

/** Pure CPU derivation of extradata — safe for worker threads (no DB, env, or filesystem). */
export function computeExtradataFromFull(full: ServerImageFull): ImageExtraData {
    const prompts = getPrompts(full.prompt, full.workflow, full.extra);
    const positive = prompts?.pos ?? '';
    const negative = prompts?.neg ?? '';
    const params = prompts?.params ?? '';
    return {
        id: full.id,
        positive,
        negative,
        params,
        models: getModels(full.prompt, full.workflow, full.extra),
        hash: hashPromptFields({ positive, negative, params }),
    };
}

export function computeExtradataBatch(fulls: ServerImageFull[]): ImageExtraData[] {
    return fulls.map(computeExtradataFromFull);
}
