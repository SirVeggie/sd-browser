import { readImageAsWebp } from '$lib/server/convert.js';
import { error } from '$lib/server/responses';
import fs from 'fs/promises';

export async function GET(e) {
    const image = 'C:\\files\\sd-shared\\outputs\\txt2img-images\\07805-1330062756-78fc05a013-920x1264-Euler-20.png';
    
    let buffer;
    try {
        // buffer = await fs.readFile(image);
        buffer = await readImageAsWebp(image);
    } catch {
        console.log(`Failed to read file: ${image}`);
        return error('Failed to read file', 500);
    }

    return new Response(buffer, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
        }
    });
}