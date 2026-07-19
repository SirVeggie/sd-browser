import { readFile, unlink } from "fs/promises";
import { generateQualityImage, generateQualityTask } from "./convert";
import { generationDisabled, getImage } from "./dataIndex";
import { qualityTierPaths } from "./paths";
import path from "path";
import { getImageType, skipGeneration } from "$lib/tools/misc";
import type { GeneratedQualityMode } from "$lib/types/misc";
import type { ServerError } from "$lib/types/requests";
import { hashPath } from "./imageUtils";

export function error(message: string | ServerError, status = 500) {
    if (typeof message === 'string') message = { error: message };
    return new Response(JSON.stringify(message), { status });
}

export function success(message?: unknown, status = 200) {
    if (!message) message = 'success';
    if (typeof message === 'string') message = { message };
    return new Response(JSON.stringify(message), { status });
}

export async function image(
    imageid: string | undefined,
    type?: string,
    defer?: boolean,
    preview?: boolean,
) {
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
        if (!skip && isGeneratedTier(type)) {
            buffer = await getImageTier(imageid!, file, type, defer);
        } else {
            buffer = await readFile(file);
        }
    } catch {
        console.log(`Failed to read file: ${file}`);
        return error('Failed to read file', 500);
    }

    return imageResponse(buffer, getImageType(img));
}

function isGeneratedTier(type: string | undefined): type is GeneratedQualityMode {
    return type === 'medium' || type === 'low' || type === 'minimal';
}

async function getImageTier(
    imageid: string,
    file: string,
    tier: GeneratedQualityMode,
    defer?: boolean,
) {
    const cachePath = path.join(qualityTierPaths[tier], `${imageid}.webp`);
    return await readFile(cachePath).then(async x => {
        if (x.byteLength < 100) {
            await unlink(cachePath);
            console.log(`${tier} preview is corrupted for ${imageid}`);
            throw new Error(`${tier} preview is corrupted`);
        }
        return x;
    }).catch(async () => {
        if (generationDisabled)
            return await readFile(file);
        if (defer) {
            await generateQualityTask(file, cachePath, tier);
            console.log(`Generated ${tier} preview for ${imageid}`);
        } else {
            console.log(`Generating ${tier} preview for ${imageid}`);
            await generateQualityImage(file, cachePath, tier);
        }
        return await readFile(cachePath);
    }).catch(async () => {
        console.log(`Failed to fix ${tier} preview for ${imageid}, sending full image`);
        return await readFile(file);
    });
}

function imageResponse(buffer: Buffer, type?: 'image' | 'video') {
    return new Response(buffer as any, {
        status: 200,
        headers: {
            'Content-Type': type === 'video' ? 'video/mp4' : 'image/png',
        }
    });
}
