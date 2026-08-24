import { readFile, unlink } from "fs/promises";
import { generateQualityImage, generateQualityTask } from "./convert";
import { generationDisabled, getImage } from "./dataIndex";
import { qualityTierPaths } from "./paths";
import path from "path";
import { getImageType, isVideo, skipGeneration } from "$lib/tools/misc";
import type { GeneratedQualityMode } from "$lib/types/misc";
import type { ServerError } from "$lib/types/requests";
import { repairMissingVideoPreview } from "./imageUtils";
import { notifyImageChange } from "./imageChangeHub";
import { parseByteRange } from "./byteRange";

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
    rangeHeader?: string | null,
) {
    const img = getImage(imageid ?? '');
    if (!img) return error('Image not found', 404);
    let file = img.file;

    if (preview && isVideo(img.file) && !img.preview) {
        const repaired = await repairMissingVideoPreview(img);
        if (repaired)
            notifyImageChange();
    }

    if (preview && img.preview) {
        file = img.preview;
    } else if (preview && isVideo(img.file)) {
        return error('Video preview not available', 500);
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

    return imageResponse(
        buffer,
        preview && img.preview ? undefined : getImageType(img),
        rangeHeader,
    );
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

function imageResponse(buffer: Buffer, type?: 'image' | 'video', rangeHeader?: string | null) {
    const contentType = type === 'video' ? 'video/mp4' : 'image/png';
    if (type !== 'video') {
        return new Response(buffer as any, {
            status: 200,
            headers: { 'Content-Type': contentType },
        });
    }

    const size = buffer.byteLength;
    const parsed = parseByteRange(rangeHeader, size);
    switch (parsed.kind) {
        case 'none':
            return new Response(buffer as any, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': String(size),
                },
            });
        case 'unsatisfiable':
            return new Response(null, {
                status: 416,
                headers: {
                    'Content-Type': contentType,
                    'Accept-Ranges': 'bytes',
                    'Content-Range': `bytes */${size}`,
                },
            });
        case 'range': {
            const slice = buffer.subarray(parsed.start, parsed.end + 1);
            return new Response(slice as any, {
                status: 206,
                headers: {
                    'Content-Type': contentType,
                    'Accept-Ranges': 'bytes',
                    'Content-Range': `bytes ${parsed.start}-${parsed.end}/${size}`,
                    'Content-Length': String(slice.byteLength),
                },
            });
        }
        default: {
            const _exhaustive: never = parsed;
            return _exhaustive;
        }
    }
}
