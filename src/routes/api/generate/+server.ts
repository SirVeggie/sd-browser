import { backgroundTasks } from '$lib/server/background.js';
import { generateQualityFromId } from '$lib/server/convert.js';
import { generationDisabled } from '$lib/server/dataIndex';
import { error, success } from '$lib/server/responses.js';
import type { GeneratedQualityMode } from '$lib/types/misc';

type GenerateRequest = {
    ids: string[];
    tier?: GeneratedQualityMode;
    smartSubsampling?: boolean;
};

function isGenerateRequest(body: unknown): body is GenerateRequest {
    if (!body || typeof body !== 'object') return false;
    const req = body as GenerateRequest;
    if (!Array.isArray(req.ids) || req.ids.some((x) => typeof x !== 'string')) return false;
    if (req.tier !== undefined && req.tier !== 'medium' && req.tier !== 'low' && req.tier !== 'minimal') return false;
    if (req.smartSubsampling !== undefined && typeof req.smartSubsampling !== 'boolean') return false;
    return true;
}

function parseGenerateRequest(body: unknown): GenerateRequest | string[] {
    if (Array.isArray(body)) return body;
    if (isGenerateRequest(body)) return body;
    return [];
}

export async function POST(e) {
    const body = await e.request.json();
    const parsed = parseGenerateRequest(body);

    let ids: string[];
    let tier: GeneratedQualityMode = 'medium';
    let smartSubsampling = true;

    if (Array.isArray(parsed)) {
        ids = parsed;
    } else {
        ids = parsed.ids;
        tier = parsed.tier ?? 'medium';
        smartSubsampling = parsed.smartSubsampling ?? true;
    }

    if (!ids.length || ids.some((x) => typeof x !== 'string')) {
        return error('Invalid request', 400);
    }

    if (!generationDisabled) {
        await Promise.all(ids.map(id =>
            backgroundTasks.addWork(() => generateQualityFromId(id, tier, smartSubsampling)),
        ));
    }
    return success('Success');
}
