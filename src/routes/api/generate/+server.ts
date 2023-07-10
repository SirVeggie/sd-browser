import { generateCompressedFromId } from '$lib/server/convert.js';
import { error, success } from '$lib/server/responses.js';

export async function POST(e) {
    console.log('Pre-generating compressed images');
    const ids = await e.request.json();
    if (!Array.isArray(ids) || ids.some((x: any) => typeof x !== 'string')) {
        return error('Invalid request', 400);
    }

    await batchGenerate(ids);
    return success('Success');
}

async function batchGenerate(ids: string[]) {
    const batchSize = 10;
    for (let i = 0; i < ids.length; i += batchSize) {
        await processBatch(ids.slice(i, i + batchSize));
    }
}

async function processBatch(ids: string[]) {
    await Promise.all(ids.map(x => generateCompressedFromId(x)));
}