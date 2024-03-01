import { backgroundTasks, generateCompressedFromId } from '$lib/server/convert.js';
import { error, success } from '$lib/server/responses.js';

export async function POST(e) {
    console.log('Pre-generating compressed images');
    const ids = await e.request.json();
    if (!Array.isArray(ids) || ids.some((x: any) => typeof x !== 'string')) {
        return error('Invalid request', 400);
    }

    await Promise.all(ids.map(id => backgroundTasks.addWork(() => generateCompressedFromId(id))));
    // await limitedParallelMap(ids as string[], id => generateCompressedFromId(id), 5);
    return success('Success');
}