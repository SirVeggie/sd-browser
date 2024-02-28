import type { ServerError } from "$lib/types";
import { readFile } from "fs/promises";
import { generateCompressed, generateThumbnail } from "./convert";
import { compressedPath, getImage, thumbnailPath } from "./filemanager";
import path from "path";
import util from 'util';
import { exec } from 'child_process'

const promisifiedExec = util.promisify(exec);

async function runPythonScript(path: string): Promise<string> {
    try {
        await promisifiedExec(`python ${'src/lib/server/stealth_pnginfo.py'} "${path}"`);
    } catch (error) {
        console.error('Error:', error);
    }
    return ''
}

export function error(message: string | ServerError, status = 500) {
    if (typeof message === 'string') message = { error: message };
    return new Response(JSON.stringify(message), { status });
}

export function success(message?: unknown, status = 200) {
    if (!message) message = 'success';
    if (typeof message === 'string') message = { message };
    return new Response(JSON.stringify(message), { status });
}

export async function image(imageid: string | undefined, type?: string, stealth?: boolean) {
    const filepath = getImage(imageid ?? '')?.file;
    if (!filepath) return error('Image not found', 404);
    if (stealth) await runPythonScript(filepath)

    let buffer;
    try {
        if (type === 'low') {
            const thumb = path.join(thumbnailPath, `${imageid}.webp`);
            buffer = await readFile(thumb).catch(async () => {
                console.log(`Generating thumbnail for ${imageid}`);
                await generateThumbnail(filepath, thumb);
                return await readFile(thumb);
            });
        } else if (type === 'medium') {
            const compressed = path.join(compressedPath, `${imageid}.webp`);
            buffer = await readFile(compressed).catch(async () => {
                console.log(`Generating compressed image for ${imageid}`);
                await generateCompressed(filepath, compressed);
                return await readFile(compressed);
            });
        } else {
            buffer = await readFile(filepath);
        }
    } catch {
        console.log(`Failed to read file: ${filepath}`);
        return error('Failed to read file', 500);
    }

    return new Response(buffer, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
        }
    });
}