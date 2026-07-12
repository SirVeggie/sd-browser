import { env } from '$env/dynamic/private';

const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188';

export function getComfyUrl(): string {
    return (env.COMFY_URL ?? DEFAULT_COMFY_URL).replace(/\/$/, '');
}

export type PostWorkflowPayload = {
    workflow: unknown;
    imageId: string;
    source?: string;
    token?: string;
};

export type ComfyStatus = {
    available: boolean;
    url: string;
    authRequired?: boolean;
    reason?: string;
};

export class ComfyAuthError extends Error {
    constructor() {
        super('ComfyUI authentication required');
        this.name = 'ComfyAuthError';
    }
}

function authorizationHeaders(token: string | undefined): HeadersInit {
    const trimmed = (env.COMFY_TOKEN || token)?.trim();
    if (!trimmed)
        return {};
    return {
        Authorization: `Bearer ${trimmed}`,
    };
}

export function parseWorkflowJson(
    workflow: string,
): { ok: true; workflow: unknown } | { ok: false; error: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(workflow);
    } catch {
        return { ok: false, error: 'Workflow metadata is not valid JSON' };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'Workflow metadata must be a JSON object' };
    }

    const nodes = (parsed as { nodes?: unknown }).nodes;
    if (!Array.isArray(nodes)) {
        return { ok: false, error: 'Workflow metadata must include a nodes array' };
    }

    return { ok: true, workflow: parsed };
}

export async function postWorkflowToComfy(payload: PostWorkflowPayload): Promise<void> {
    const comfyUrl = getComfyUrl();
    const url = `${comfyUrl}/sv_sd_browser/open_workflow`;

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                ...authorizationHeaders(payload.token),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                workflow: payload.workflow,
                imageId: payload.imageId,
                source: payload.source ?? 'sd-browser',
            }),
        });
    } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`ComfyUI is unreachable at ${comfyUrl}: ${detail}`);
    }

    if (!response.ok) {
        if (response.status === 401) {
            throw new ComfyAuthError();
        }
        const errText = await response.text().catch(() => '');
        throw new Error(
            `ComfyUI rejected workflow (${response.status}): ${errText || response.statusText}`,
        );
    }
}

export async function checkComfyWorkflowOpenAvailable(token?: string): Promise<ComfyStatus> {
    const comfyUrl = getComfyUrl();
    const url = `${comfyUrl}/sv_sd_browser/status`;

    let response: Response;
    try {
        response = await fetch(url, {
            headers: authorizationHeaders(token),
        });
    } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        return {
            available: false,
            url: comfyUrl,
            reason: `ComfyUI is unreachable: ${detail}`,
        };
    }

    if (!response.ok) {
        if (response.status === 401) {
            return {
                available: false,
                url: comfyUrl,
                authRequired: true,
                reason: 'ComfyUI authentication required',
            };
        }
        return {
            available: false,
            url: comfyUrl,
            reason: `SV Comfy extension is not available (${response.status})`,
        };
    }

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        return {
            available: false,
            url: comfyUrl,
            reason: 'SV Comfy extension returned invalid status JSON',
        };
    }

    if (
        payload
        && typeof payload === 'object'
        && !Array.isArray(payload)
        && 'ok' in payload
        && payload.ok === true
    ) {
        return { available: true, url: comfyUrl };
    }

    return {
        available: false,
        url: comfyUrl,
        reason: 'SV Comfy extension status check failed',
    };
}
