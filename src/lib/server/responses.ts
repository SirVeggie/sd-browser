import type { ServerError } from "$lib/types";
import { readFile, unlink } from "fs/promises";
import { generateCompressed, generateCompressedTask, generateThumbnail, generateThumbnailTask } from "./convert";
import { compressedPath, generationDisabled, getImage, hashPath, thumbnailPath } from "./filemanager";
import path from "path";
import { getImageType, skipGeneration } from "$lib/tools/misc";

export function error(message: string | ServerError, status = 500) {
    if (typeof message === 'string') message = { error: message };
    return new Response(JSON.stringify(message), { status });
}

export function success(message?: unknown, status = 200) {
    if (!message) message = 'success';
    if (typeof message === 'string') message = { message };
    return new Response(JSON.stringify(message), { status });
}

export async function image(imageid: string | undefined, type?: string, defer?: boolean, preview?: boolean) {
    const img = getImage(imageid ?? '');
    if (!img) return error('Image not found', 404);
    let file = img.file;

    if (preview && img.preview) {
        file = img.preview;
        imageid = hashPath(file);
    }

    const skip = skipGeneration(file);

    let buffer;
    try {
        if (!skip && type === 'low') {
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
                    return await readFile(file);
                if (defer) {
                    await generateThumbnailTask(file, thumb);
                    console.log(`Generated thumbnail for ${imageid}`);
                } else {
                    console.log(`Generating thumbnail for ${imageid}`);
                    await generateThumbnail(file, thumb);
                }
                return await readFile(thumb);
            }).catch(async () => {
                console.log(`Failed to fix image thumbnail for ${imageid}, sending full image`);
                return await readFile(file);
            });
        } else if (!skip && type === 'medium') {
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
                    return await readFile(file);
                if (defer) {
                    await generateCompressedTask(file, compressed);
                    console.log(`Generated preview for ${imageid}`);
                } else {
                    console.log(`Generating preview for ${imageid}`);
                    await generateCompressed(file, compressed);
                }
                return await readFile(compressed);
            }).catch(async () => {
                console.log(`Failed to fix image preview for ${imageid}, sending full image`);
                return await readFile(file);
            });
        } else {
            buffer = await readFile(file);
        }
    } catch {
        console.log(`Failed to read file: ${file}`);
        return error('Failed to read file', 500);
    }

    return imageResponse(buffer, getImageType(img));
}

function imageResponse(buffer: Buffer, type?: 'image' | 'video') {
    return new Response(buffer, {
        status: 200,
        headers: {
            'Content-Type': type === 'video' ? 'video/mp4' : 'image/png',
        }
    });
}