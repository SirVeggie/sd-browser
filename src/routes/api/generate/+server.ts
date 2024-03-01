import { backgroundTasks } from '$lib/server/background.js';
import { generateCompressedFromId } from '$lib/server/convert.js';
import { generationDisabled } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';

export async function POST(e) {
    const ids = await e.request.json();
    if (!Array.isArray(ids) || ids.some((x: any) => typeof x !== 'string')) {
        return error('Invalid request', 400);
    }

    if (!generationDisabled)
        await Promise.all(ids.map(id => backgroundTasks.addWork(() => generateCompressedFromId(id))));
    return success('Success');
}