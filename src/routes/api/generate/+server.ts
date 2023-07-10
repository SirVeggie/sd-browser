import { generateCompressedImage } from '$lib/server/convert.js';
import { compressedPath, getImage } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';
import fs from 'fs/promises';
import path from 'path';

export async function POST(e) {
    console.log('Pre-generating compressed images');
    const ids = await e.request.json();
    if (!Array.isArray(ids) || ids.some((x: any) => typeof x !== 'string')) {
        return error('Invalid request', 400);
    }

    await Promise.all(ids.map(generate));
    return success('Success');
}

async function generate(id: string) {
    const image = getImage(id);
    if (!image) return;
    const output = path.join(compressedPath, `${id}.webp`);
    const stats = await fs.stat(output).catch(() => undefined);
    if (stats?.isFile()) return;
    console.log(`Generating for ${id}`);
    await generateCompressedImage(image.file, output);
}