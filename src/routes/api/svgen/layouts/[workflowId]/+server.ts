import { invalidAuth } from '$lib/server/auth';
import { error, success } from '$lib/server/responses';
import { SvgenDB } from '$lib/server/svgen/db';

type PutLayoutRequest = {
    layout: unknown;
};

function isPutLayoutRequest(body: unknown): body is PutLayoutRequest {
    return !!body && typeof body === 'object' && 'layout' in body;
}

function serializeLayout(layout: unknown): string {
    if (typeof layout === 'string')
        return layout;
    return JSON.stringify(layout);
}

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const workflowId = e.params.workflowId;
    const row = SvgenDB.getLayout(workflowId);
    return success({ layout: row?.layout ?? null });
}

export async function PUT(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const workflowId = e.params.workflowId;
    if (!SvgenDB.getWorkflow(workflowId)) {
        return error('Workflow not found', 404);
    }

    let body: unknown;
    try {
        body = await e.request.json();
    } catch {
        return error('Invalid JSON request body', 400);
    }

    if (!isPutLayoutRequest(body)) {
        return error('Invalid request body', 400);
    }

    SvgenDB.upsertLayout({
        workflowId,
        layout: serializeLayout(body.layout),
        updatedAt: Date.now(),
    });

    return success();
}
