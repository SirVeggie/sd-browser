import type { ServerError } from "$lib/types";
import { readFile, unlink } from "fs/promises";
import { generateCompressed, generateCompressedTask, generateThumbnail, generateThumbnailTask } from "./convert";
import { compressedPath, generationDisabled, getImage, thumbnailPath } from "./filemanager";
import path from "path";

export function error(message: string | ServerError, status = 500) {
    if (typeof message === 'string') message = { error: message };
    return new Response(JSON.stringify(message), { status });
}

export function success(message?: unknown, status = 200) {
    if (!message) message = 'success';
    if (typeof message === 'string') message = { message };
    return new Response(JSON.stringify(message), { status });
}

export async function image(imageid: string | undefined, type?: string, defer?: boolean) {
    const filepath = getImage(imageid ?? '')?.file;
    if (!filepath) return error('Image not found', 404);

    let buffer;
    try {
        if (type === 'low') {
            const thumb = path.join(thumbnailPath, `${imageid}.webp`);
            buffer = await readFile(thumb).then(async x => {
                if (x.byteLength < 100) {
                    await unlink(thumb);
                    console.log(`Thumbnail is corrupted for ${imageid}`);
                    throw new Error("Thumbnail is corrupted");
                }
                return x;
            }).catch(async () => {
                if (generationDisabled)
                    return await readFile(filepath);
                if (defer) {
                    await generateThumbnailTask(filepath, thumb);
                    console.log(`Generated thumbnail for ${imageid}`);
                } else {
                    console.log(`Generating thumbnail for ${imageid}`);
                    await generateThumbnail(filepath, thumb);
                }
                return await readFile(thumb);
            });
        } else if (type === 'medium') {
            const compressed = path.join(compressedPath, `${imageid}.webp`);
            buffer = await readFile(compressed).then(async x => {
                if (x.byteLength < 100) {
                    await unlink(compressed);
                    console.log(`Preview is corrupted for ${imageid}`);
                    throw new Error("Preview is corrupted");
                }
                return x;
            }).catch(async () => {
                if (generationDisabled)
                    return await readFile(filepath);
                if (defer) {
                    await generateCompressedTask(filepath, compressed);
                    console.log(`Generated preview for ${imageid}`);
                } else {
                    console.log(`Generating preview for ${imageid}`);
                    await generateCompressed(filepath, compressed);
                }
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