import { get } from 'svelte/store';
import { authStore } from '$lib/stores/authStore';
import { page } from '$app/stores';
import type { ComfyPrompt, ComfyWorkflow } from '$lib/types/images';
import type { ObjectInfoMap, SvgenWorkflowSummary } from './types';

export class SvgenComfyAuthError extends Error {
    constructor(message = 'ComfyUI authentication required') {
        super(message);
        this.name = 'SvgenComfyAuthError';
    }
}

function originUrl(path: string): string {
    return get(page).url.origin + path;
}

function headers(comfyToken?: string): HeadersInit {
    const h: Record<string, string> = {
        Authorization: 'Bearer ' + get(authStore).password,
        'Content-Type': 'application/json',
    };
    const trimmed = comfyToken?.trim();
    if (trimmed)
        h['X-Comfy-Authorization'] = `Bearer ${trimmed}`;
    return h;
}

async function parseJson(response: Response): Promise<unknown> {
    return response.json().catch(() => ({}));
}

function throwIfError(response: Response, body: unknown, fallback: string): void {
    if (response.ok)
        return;
    if (
        response.status === 401
        && body
        && typeof body === 'object'
        && 'code' in body
        && body.code === 'comfy_auth_required'
    ) {
        throw new SvgenComfyAuthError();
    }
    const message = body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : fallback;
    throw new Error(message);
}

export async function fetchSvgenStatus(comfyToken?: string): Promise<{
    available: boolean;
    url?: string;
    publicUrl?: string;
    convert?: boolean;
    authRequired?: boolean;
    reason?: string;
}> {
    const response = await fetch(originUrl('/api/svgen/status'), { headers: headers(comfyToken) });
    const body = await parseJson(response);
    throwIfError(response, body, 'Failed to check Comfy status');
    return body as {
        available: boolean;
        url?: string;
        publicUrl?: string;
        convert?: boolean;
        authRequired?: boolean;
        reason?: string;
    };
}

export async function convertWorkflow(
    workflow: ComfyWorkflow,
    comfyToken?: string,
): Promise<ComfyPrompt> {
    const response = await fetch(originUrl('/api/svgen/convert'), {
        method: 'POST',
        headers: headers(comfyToken),
        body: JSON.stringify({ workflow }),
    });
    const body = await parseJson(response);
    throwIfError(response, body, 'Workflow convert failed');
    return body as ComfyPrompt;
}

export async function submitPrompt(payload: {
    prompt: ComfyPrompt;
    workflow: ComfyWorkflow;
    clientId: string;
    promptId?: string;
    comfyToken?: string;
}): Promise<{ prompt_id?: string; number?: number }> {
    const response = await fetch(originUrl('/api/svgen/prompt'), {
        method: 'POST',
        headers: headers(payload.comfyToken),
        body: JSON.stringify({
            prompt: payload.prompt,
            workflow: payload.workflow,
            clientId: payload.clientId,
            promptId: payload.promptId,
        }),
    });
    const body = await parseJson(response);
    throwIfError(response, body, 'Prompt submit failed');
    return body as { prompt_id?: string; number?: number };
}

export async function fetchQueue(comfyToken?: string): Promise<{
    queue_running?: unknown[];
    queue_pending?: unknown[];
}> {
    const response = await fetch(originUrl('/api/svgen/queue'), { headers: headers(comfyToken) });
    const body = await parseJson(response);
    throwIfError(response, body, 'Queue fetch failed');
    return body as {
        queue_running?: unknown[];
        queue_pending?: unknown[];
    };
}

export async function deleteQueued(ids: string[], comfyToken?: string): Promise<void> {
    const response = await fetch(originUrl('/api/svgen/queue'), {
        method: 'POST',
        headers: headers(comfyToken),
        body: JSON.stringify({ delete: ids }),
    });
    const body = await parseJson(response);
    throwIfError(response, body, 'Queue delete failed');
}

export async function clearQueued(comfyToken?: string): Promise<void> {
    const response = await fetch(originUrl('/api/svgen/queue'), {
        method: 'POST',
        headers: headers(comfyToken),
        body: JSON.stringify({ clear: true }),
    });
    const body = await parseJson(response);
    throwIfError(response, body, 'Queue clear failed');
}

export async function interruptPrompt(promptId?: string, comfyToken?: string): Promise<void> {
    const response = await fetch(originUrl('/api/svgen/interrupt'), {
        method: 'POST',
        headers: headers(comfyToken),
        body: JSON.stringify(promptId ? { promptId } : {}),
    });
    const body = await parseJson(response);
    throwIfError(response, body, 'Interrupt failed');
}

export async function fetchObjectInfo(comfyToken?: string): Promise<ObjectInfoMap> {
    const response = await fetch(originUrl('/api/svgen/object_info'), { headers: headers(comfyToken) });
    const body = await parseJson(response);
    throwIfError(response, body, 'object_info failed');
    return body as ObjectInfoMap;
}

export async function listWorkflows(): Promise<SvgenWorkflowSummary[]> {
    const response = await fetch(originUrl('/api/svgen/workflows'), { headers: headers() });
    const body = await parseJson(response);
    throwIfError(response, body, 'Failed to list workflows');
    return (body as { workflows: SvgenWorkflowSummary[] }).workflows ?? [];
}

export async function getWorkflow(id: string): Promise<{
    id: string;
    name: string;
    workflow: ComfyWorkflow;
    prompt: ComfyPrompt | null;
    sourceImageId: string | null;
}> {
    const response = await fetch(originUrl(`/api/svgen/workflows/${encodeURIComponent(id)}`), {
        headers: headers(),
    });
    const body = await parseJson(response);
    throwIfError(response, body, 'Failed to load workflow');
    return body as {
        id: string;
        name: string;
        workflow: ComfyWorkflow;
        prompt: ComfyPrompt | null;
        sourceImageId: string | null;
    };
}

export async function saveWorkflow(payload: {
    id?: string;
    name: string;
    workflow: ComfyWorkflow;
    prompt?: ComfyPrompt | null;
    sourceImageId?: string | null;
}): Promise<{ id: string }> {
    const response = await fetch(originUrl('/api/svgen/workflows'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
    });
    const body = await parseJson(response);
    throwIfError(response, body, 'Failed to save workflow');
    return body as { id: string };
}

export async function deleteWorkflow(id: string): Promise<void> {
    const response = await fetch(originUrl(`/api/svgen/workflows/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: headers(),
    });
    const body = await parseJson(response);
    throwIfError(response, body, 'Failed to delete workflow');
}

export async function getLayout(workflowId: string): Promise<string | null> {
    const response = await fetch(
        originUrl(`/api/svgen/layouts/${encodeURIComponent(workflowId)}`),
        { headers: headers() },
    );
    const body = await parseJson(response);
    throwIfError(response, body, 'Failed to load layout');
    return (body as { layout: string | null }).layout ?? null;
}

export async function putLayout(workflowId: string, layout: unknown): Promise<void> {
    const response = await fetch(
        originUrl(`/api/svgen/layouts/${encodeURIComponent(workflowId)}`),
        {
            method: 'PUT',
            headers: headers(),
            body: JSON.stringify({ layout }),
        },
    );
    const body = await parseJson(response);
    throwIfError(response, body, 'Failed to save layout');
}

export async function openFromImage(imageId: string): Promise<{
    workflow: ComfyWorkflow;
    prompt: ComfyPrompt | null;
    sourceImageId: string;
}> {
    const response = await fetch(originUrl('/api/svgen/open-from-image'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ imageId }),
    });
    const body = await parseJson(response);
    throwIfError(response, body, 'Failed to open workflow from image');
    return body as {
        workflow: ComfyWorkflow;
        prompt: ComfyPrompt | null;
        sourceImageId: string;
    };
}

export async function fetchPendingPanelWorkflow(): Promise<{
    id: string;
    workflow: ComfyWorkflow;
    name?: string | null;
    source?: string | null;
} | null> {
    const response = await fetch(originUrl('/api/svgen/pending-panel-workflow'), {
        headers: headers(),
    });
    const body = await parseJson(response);
    throwIfError(response, body, 'Failed to poll pending panel workflow');
    if (
        !body
        || typeof body !== 'object'
        || Array.isArray(body)
        || !('workflow' in body)
        || (body as { workflow: unknown }).workflow == null
    ) {
        return null;
    }
    return body as {
        id: string;
        workflow: ComfyWorkflow;
        name?: string | null;
        source?: string | null;
    };
}
