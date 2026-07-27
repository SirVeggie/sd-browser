import { invalidAuth } from '$lib/server/auth';
import { error, success } from '$lib/server/responses';
import { SvgenDB } from '$lib/server/svgen/db';
import type { ComfyPrompt } from '$lib/types/images';
import { v4 as uuidv4 } from 'uuid';

type SaveWorkflowRequest = {
    id?: string;
    name: string;
    workflow: unknown;
    prompt?: ComfyPrompt | null;
    sourceImageId?: string | null;
};

function hasWorkflowNodes(workflow: unknown): boolean {
    return !!workflow
        && typeof workflow === 'object'
        && !Array.isArray(workflow)
        && Array.isArray((workflow as { nodes?: unknown }).nodes);
}

function isSaveWorkflowRequest(body: unknown): body is SaveWorkflowRequest {
    if (!body || typeof body !== 'object')
        return false;
    const request = body as SaveWorkflowRequest;
    return typeof request.name === 'string'
        && request.name.trim().length > 0
        && hasWorkflowNodes(request.workflow)
        && (request.id === undefined || typeof request.id === 'string')
        && (request.prompt === undefined || request.prompt === null || typeof request.prompt === 'object')
        && (request.sourceImageId === undefined || request.sourceImageId === null || typeof request.sourceImageId === 'string');
}

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    return success({ workflows: SvgenDB.listWorkflowSummaries() });
}

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    let body: unknown;
    try {
        body = await e.request.json();
    } catch {
        return error('Invalid JSON request body', 400);
    }

    if (!isSaveWorkflowRequest(body)) {
        return error('Invalid request body', 400);
    }

    const now = Date.now();
    const id = body.id?.trim() || uuidv4();
    const existing = body.id ? SvgenDB.getWorkflow(id) : undefined;

    SvgenDB.upsertWorkflow({
        id,
        name: body.name.trim(),
        workflow: JSON.stringify(body.workflow),
        prompt: body.prompt ? JSON.stringify(body.prompt) : null,
        sourceImageId: body.sourceImageId ?? null,
        updatedAt: now,
        createdAt: existing?.createdAt ?? now,
    });

    return success({ id });
}
