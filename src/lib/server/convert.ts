import sharp from 'sharp';
import { qualityTierPaths } from './paths';
import { getImage } from './dataIndex';
import path from 'path';
import fs from 'fs/promises';
import { backgroundTasks } from './background';
import { sleep } from '$lib/tools/sleep';
import { skipGeneration } from '$lib/tools/misc';
import type { EmbeddingApiType } from '$lib/types/embeddings';
import type { GeneratedQualityMode } from '$lib/types/misc';

/** Local library images (cameras/phones) often have minor JPEG marker issues. */
const TRUSTED_IMAGE_INPUT: sharp.SharpOptions = { failOn: 'truncated' };

export type QualityTierSettings = {
    width?: number;
    quality: number;
    effort: number;
};

export const QUALITY_TIER_SETTINGS: Record<GeneratedQualityMode, QualityTierSettings> = {
    medium: { quality: 90, effort: 0 },
    low: { width: 460, quality: 80, effort: 0 },
    minimal: { width: 230, quality: 70, effort: 6 },
};

const LLAMA_EMBEDDING_MAX_TOTAL_PIXELS = 512 * 512;
const SV_EMBED_INPUT_SIZE = 384;

export function buildWebpOptions(
    settings: QualityTierSettings,
    smartSubsample: boolean,
): sharp.WebpOptions {
    return {
        quality: settings.quality,
        effort: settings.effort,
        ...(smartSubsample ? { smartSubsample: true } : {}),
    };
}

export function fitImageToMaxTotalPixels(
    width: number,
    height: number,
    maxTotalPixels: number,
): { width: number; height: number } {
    const totalPixels = width * height;
    if (totalPixels <= maxTotalPixels) {
        return { width, height };
    }

    const scale = Math.sqrt(maxTotalPixels / totalPixels);
    let nextWidth = Math.max(1, Math.floor(width * scale));
    let nextHeight = Math.max(1, Math.floor(height * scale));

    while (nextWidth * nextHeight > maxTotalPixels) {
        if (nextWidth / width >= nextHeight / height) {
            nextWidth--;
        } else {
            nextHeight--;
        }
    }

    return { width: nextWidth, height: nextHeight };
}

export async function encodeImageForLlm(imagepath: string): Promise<Buffer> {
    return sharp(imagepath, TRUSTED_IMAGE_INPUT).jpeg({ quality: 80 }).toBuffer();
}

/** Encode an image for the configured embedding API. */
export async function encodeImageForEmbedding(
    imagepath: string,
    apiType: EmbeddingApiType = 'llama-cpp',
): Promise<Buffer> {
    const image = sharp(imagepath, TRUSTED_IMAGE_INPUT);

    const metadata = await image.metadata();
    const width = metadata.width;
    const height = metadata.height;
    if (!width || !height) {
        throw new Error('Cannot read image dimensions');
    }

    switch (apiType) {
        case 'sv-embed':
            return image
                .resize(SV_EMBED_INPUT_SIZE, SV_EMBED_INPUT_SIZE, {
                    kernel: sharp.kernel.cubic,
                    fit: 'fill',
                })
                .webp({ quality: 90 })
                .toBuffer();
        case 'llama-cpp': {
            const target = fitImageToMaxTotalPixels(width, height, LLAMA_EMBEDDING_MAX_TOTAL_PIXELS);
            if (target.width === width && target.height === height) {
                return image.jpeg({ quality: 80 }).toBuffer();
            }

            return image
                .resize(target.width, target.height, {
                    kernel: sharp.kernel.cubic,
                })
                .jpeg({ quality: 80 })
                .toBuffer();
        }
        default: {
            const _exhaustive: never = apiType;
            throw new Error(`Unknown embedding API type: ${_exhaustive}`);
        }
    }
}

export function generateQualityTask(
    imagepath: string,
    outputpath: string,
    tier: GeneratedQualityMode,
    smartSubsample: boolean,
): Promise<string> {
    return backgroundTasks.addWork(
        () => generateQualityImage(imagepath, outputpath, tier, smartSubsample),
        true,
    );
}

export async function generateQualityImage(
    imagepath: string,
    outputpath: string,
    tier: GeneratedQualityMode,
    smartSubsample: boolean,
): Promise<string> {
    const settings = QUALITY_TIER_SETTINGS[tier];
    const webpOptions = buildWebpOptions(settings, smartSubsample);
    let pipeline = sharp(imagepath, TRUSTED_IMAGE_INPUT);
    if (settings.width) {
        pipeline = pipeline.resize({ width: settings.width });
    }
    await pipeline.webp(webpOptions).toFile(outputpath);
    return outputpath;
}

export async function generateQualityFromId(
    id: string,
    tier: GeneratedQualityMode,
    smartSubsample = true,
    file?: string,
) {
    const imagepath = file ?? getImage(id)?.file;
    if (!imagepath) return;
    if (skipGeneration(imagepath)) return;
    const output = path.join(qualityTierPaths[tier], `${id}.webp`);
    const stats = await fs.stat(output).catch(() => undefined);
    if (stats?.isFile()) return;
    console.log(`Generating ${tier} preview for ${id}`);
    await generateQualityImage(imagepath, output, tier, smartSubsample).catch(async () => {
        console.log(`Failed to generate ${tier} preview, retrying...`);
        await sleep(200);
        await generateQualityImage(imagepath, output, tier, smartSubsample).catch(handleGenerationError(output));
    });
}

/** @deprecated use generateQualityFromId with tier 'medium' */
export async function generateCompressedFromId(id: string, file?: string) {
    return generateQualityFromId(id, 'medium', true, file);
}

/** @deprecated use generateQualityFromId with tier 'low' */
export async function generateThumbnailFromId(id: string, file?: string) {
    return generateQualityFromId(id, 'low', true, file);
}

function handleGenerationError(output: string) {
    return async (error: unknown) => {
        console.error(error);
        await sleep(200);
        await fs.unlink(output).catch(() => undefined);
    }
}
