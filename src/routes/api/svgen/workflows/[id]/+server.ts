import { invalidAuth } from '$lib/server/auth';
import { error, success } from '$lib/server/responses';
import { SvgenDB } from '$lib/server/svgen/db';
import type { ComfyPrompt, ComfyWorkflow } from '$lib/types/images';

function parseStoredJson<T>(value: string | null): T | null {
    if (!value)
        return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const id = e.params.id;
    const row = SvgenDB.getWorkflow(id);
    if (!row) {
        return error('Workflow not found', 404);
    }

    const workflow = parseStoredJson<ComfyWorkflow>(row.workflow);
    if (!workflow) {
        return error('Stored workflow is not valid JSON', 500);
    }

    return success({
        id: row.id,
        name: row.name,
        workflow,
        prompt: parseStoredJson<ComfyPrompt>(row.prompt),
        sourceImageId: row.sourceImageId,
    });
}

export async function DELETE(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const id = e.params.id;
    if (!SvgenDB.deleteWorkflow(id)) {
        return error('Workflow not found', 404);
    }

    return success();
}
