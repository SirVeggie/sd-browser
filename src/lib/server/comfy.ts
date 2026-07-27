import { env } from '$env/dynamic/private';

const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188';

export function getComfyUrl(): string {
    return (env.COMFY_URL ?? DEFAULT_COMFY_URL).replace(/\/$/, '');
}

/** Browser-reachable Comfy URL for WebSocket progress (falls back to COMFY_URL). */
export function getComfyPublicUrl(): string {
    const publicUrl = (env.COMFY_PUBLIC_URL ?? '').trim().replace(/\/$/, '');
    return publicUrl || getComfyUrl();
}

export type PostWorkflowPayload = {
    workflow: unknown;
    imageId?: string;
    source?: string;
    token?: string;
};

export type ComfyStatus = {
    available: boolean;
    url: string;
    publicUrl: string;
    convert?: boolean;
    authRequired?: boolean;
    reason?: string;
};

export class ComfyAuthError extends Error {
    constructor() {
        super('ComfyUI authentication required');
        this.name = 'ComfyAuthError';
    }
}

export class ComfyRequestError extends Error {
    status: number;
    body: unknown;

    constructor(message: string, status: number, body?: unknown) {
        super(message);
        this.name = 'ComfyRequestError';
        this.status = status;
        this.body = body;
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

async function comfyFetch(
    path: string,
    init: RequestInit & { token?: string } = {},
): Promise<Response> {
    const comfyUrl = getComfyUrl();
    const { token, headers, ...rest } = init;
    let response: Response;
    try {
        response = await fetch(`${comfyUrl}${path}`, {
            ...rest,
            headers: {
                ...authorizationHeaders(token),
                ...(headers ?? {}),
            },
        });
    } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`ComfyUI is unreachable at ${comfyUrl}: ${detail}`);
    }

    if (response.status === 401) {
        throw new ComfyAuthError();
    }
    return response;
}

async function readComfyJson(response: Response): Promise<unknown> {
    const text = await response.text().catch(() => '');
    if (!text)
        return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
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
    const response = await comfyFetch('/sv_sd_browser/open_workflow', {
        method: 'POST',
        token: payload.token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            workflow: payload.workflow,
            ...(payload.imageId ? { imageId: payload.imageId } : {}),
            source: payload.source ?? 'sd-browser',
        }),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(
            `ComfyUI rejected workflow (${response.status}): ${errText || response.statusText}`,
        );
    }
}

export type PendingPanelWorkflow = {
    id: string;
    workflow: unknown;
    name?: string | null;
    source?: string | null;
};

/** Consume a one-shot workflow queued by Comfy's SV Gen panel (or null if none). */
export async function fetchPendingPanelWorkflow(
    token?: string,
): Promise<PendingPanelWorkflow | null> {
    const response = await comfyFetch('/sv_sd_browser/pending_panel_workflow', { token });
    const body = await readComfyJson(response);
    if (!response.ok) {
        const message = typeof body === 'object' && body && 'error' in body
            ? String((body as { error: unknown }).error)
            : `Pending panel workflow fetch failed (${response.status})`;
        throw new ComfyRequestError(message, response.status, body);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ComfyRequestError('Pending panel workflow returned invalid JSON', 502, body);
    }
    const workflow = (body as { workflow?: unknown }).workflow;
    if (workflow == null)
        return null;
    if (typeof workflow !== 'object' || Array.isArray(workflow)) {
        throw new ComfyRequestError('Pending panel workflow is not an object', 502, body);
    }
    const nodes = (workflow as { nodes?: unknown }).nodes;
    if (!Array.isArray(nodes)) {
        throw new ComfyRequestError('Pending panel workflow is missing a nodes array', 502, body);
    }
    const id = (body as { id?: unknown }).id;
    if (typeof id !== 'string' || !id) {
        throw new ComfyRequestError('Pending panel workflow is missing id', 502, body);
    }
    const name = (body as { name?: unknown }).name;
    const source = (body as { source?: unknown }).source;
    return {
        id,
        workflow,
        name: typeof name === 'string' ? name : null,
        source: typeof source === 'string' ? source : null,
    };
}

export async function checkComfyWorkflowOpenAvailable(token?: string): Promise<ComfyStatus> {
    const comfyUrl = getComfyUrl();
    const publicUrl = getComfyPublicUrl();

    let response: Response;
    try {
        response = await comfyFetch('/sv_sd_browser/status', { token });
    } catch (cause) {
        if (cause instanceof ComfyAuthError) {
            return {
                available: false,
                url: comfyUrl,
                publicUrl,
                authRequired: true,
                reason: 'ComfyUI authentication required',
            };
        }
        const detail = cause instanceof Error ? cause.message : String(cause);
        return {
            available: false,
            url: comfyUrl,
            publicUrl,
            reason: detail.startsWith('ComfyUI is unreachable')
                ? detail
                : `ComfyUI is unreachable: ${detail}`,
        };
    }

    if (!response.ok) {
        return {
            available: false,
            url: comfyUrl,
            publicUrl,
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
            publicUrl,
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
        const convert = 'convert' in payload && payload.convert === true;
        return { available: true, url: comfyUrl, publicUrl, convert };
    }

    return {
        available: false,
        url: comfyUrl,
        publicUrl,
        reason: 'SV Comfy extension status check failed',
    };
}

export async function convertWorkflowToApi(
    workflow: unknown,
    token?: string,
): Promise<Record<string, unknown>> {
    const response = await comfyFetch('/sv_sd_browser/convert', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
    });

    const body = await readComfyJson(response);
    if (!response.ok) {
        const message = typeof body === 'object' && body && 'error' in body
            ? String((body as { error: unknown }).error)
            : `ComfyUI convert failed (${response.status})`;
        throw new ComfyRequestError(message, response.status, body);
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ComfyRequestError('ComfyUI convert returned invalid JSON', 502, body);
    }
    return body as Record<string, unknown>;
}

export type ComfyPromptSubmit = {
    prompt: Record<string, unknown>;
    clientId?: string;
    promptId?: string;
    workflow?: unknown;
    number?: number;
    front?: boolean;
    token?: string;
};

export async function submitComfyPrompt(payload: ComfyPromptSubmit): Promise<unknown> {
    const body: Record<string, unknown> = {
        prompt: payload.prompt,
    };
    if (payload.clientId)
        body.client_id = payload.clientId;
    if (payload.promptId)
        body.prompt_id = payload.promptId;
    if (payload.number !== undefined)
        body.number = payload.number;
    if (payload.front !== undefined)
        body.front = payload.front;
    if (payload.workflow !== undefined) {
        body.workflow = payload.workflow;
        body.extra_data = {
            extra_pnginfo: {
                workflow: payload.workflow,
            },
        };
    }

    const response = await comfyFetch('/prompt', {
        method: 'POST',
        token: payload.token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const result = await readComfyJson(response);
    if (!response.ok) {
        const message = typeof result === 'object' && result && 'error' in result
            ? String((result as { error: unknown }).error)
            : `ComfyUI prompt failed (${response.status})`;
        throw new ComfyRequestError(message, response.status, result);
    }
    return result;
}

export async function getComfyQueue(token?: string): Promise<unknown> {
    const response = await comfyFetch('/queue', { token });
    const body = await readComfyJson(response);
    if (!response.ok) {
        throw new ComfyRequestError(`ComfyUI queue failed (${response.status})`, response.status, body);
    }
    return body;
}

export async function postComfyQueue(
    body: { delete?: string[]; clear?: boolean },
    token?: string,
): Promise<unknown> {
    const response = await comfyFetch('/queue', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const result = await readComfyJson(response);
    if (!response.ok) {
        throw new ComfyRequestError(`ComfyUI queue update failed (${response.status})`, response.status, result);
    }
    return result;
}

export async function interruptComfyPrompt(
    promptId: string | undefined,
    token?: string,
): Promise<unknown> {
    const response = await comfyFetch('/interrupt', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptId ? { prompt_id: promptId } : {}),
    });
    const result = await readComfyJson(response);
    if (!response.ok) {
        throw new ComfyRequestError(`ComfyUI interrupt failed (${response.status})`, response.status, result);
    }
    return result;
}

export async function getComfyObjectInfo(token?: string): Promise<unknown> {
    const response = await comfyFetch('/object_info', { token });
    const body = await readComfyJson(response);
    if (!response.ok) {
        throw new ComfyRequestError(`ComfyUI object_info failed (${response.status})`, response.status, body);
    }
    return body;
}

export async function uploadComfyImage(
    file: Blob,
    filename: string,
    folderType: 'input' | 'output' | 'temp' = 'input',
    token?: string,
): Promise<{ name: string; subfolder: string; type: string }> {
    const body = new FormData();
    body.append('image', file, filename);
    body.append('type', folderType);
    body.append('overwrite', 'true');
    const response = await comfyFetch('/upload/image', {
        method: 'POST',
        token,
        body,
    });
    const result = await readComfyJson(response);
    if (!response.ok) {
        throw new ComfyRequestError(
            `ComfyUI image upload failed (${response.status})`,
            response.status,
            result,
        );
    }
    const data = (result && typeof result === 'object' ? result : {}) as {
        name?: string;
        filename?: string;
        subfolder?: string;
        type?: string;
    };
    return {
        name: data.name || data.filename || filename,
        subfolder: data.subfolder || '',
        type: data.type || folderType,
    };
}

/** Proxy Comfy `/view` for LoadImage / local: previews. */
export async function viewComfyImage(
    params: URLSearchParams,
    token?: string,
): Promise<Response> {
    const response = await comfyFetch(`/view?${params.toString()}`, { token });
    if (response.status === 401)
        throw new ComfyAuthError();
    return response;
}
