import sharp from 'sharp';
import { qualityTierPaths } from './paths';
import { getImage } from './dataIndex';
import path from 'path';
import fs from 'fs/promises';
import { backgroundTasks } from './background';
import { sleep } from '$lib/tools/sleep';
import { skipGeneration } from '$lib/tools/misc';
import {
    fitImageToMaxTotalPixels,
    fitMediumPreviewSize,
} from '$lib/tools/imageGeometry';
import type { EmbeddingApiType } from '$lib/types/embeddings';
import type { GeneratedQualityMode } from '$lib/types/misc';

export {
    MEDIUM_MAX_TOTAL_PIXELS,
    WEBP_MAX_DIMENSION,
    clampToWebpMaxDimension,
    fitImageToMaxTotalPixels,
    fitMediumPreviewSize,
} from '$lib/tools/imageGeometry';

/** Local library images (cameras/phones) often have minor JPEG marker issues. */
const TRUSTED_IMAGE_INPUT: sharp.SharpOptions = { failOn: 'truncated' };

export type QualityTierSettings = {
    width?: number;
    quality: number;
    effort: number;
};

/**
 * Medium/low use effort 4 (not 0): libwebp with effort 0 hits PARTITION0_OVERFLOW on
 * large/high-entropy images. Medium is also capped at 2MP (see fitMediumPreviewSize).
 * Smart subsampling is always disabled.
 */
export const QUALITY_TIER_SETTINGS: Record<GeneratedQualityMode, QualityTierSettings> = {
    medium: { quality: 90, effort: 4 },
    low: { width: 460, quality: 80, effort: 4 },
    minimal: { width: 230, quality: 70, effort: 6 },
};

const LLAMA_EMBEDDING_MAX_TOTAL_PIXELS = 512 * 512;
const SV_EMBED_INPUT_SIZE = 384;

export function buildWebpOptions(settings: QualityTierSettings): sharp.WebpOptions {
    return {
        quality: settings.quality,
        effort: settings.effort,
        smartSubsample: false,
    };
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
): Promise<string> {
    return backgroundTasks.addWork(
        () => generateQualityImage(imagepath, outputpath, tier),
        true,
    );
}

export async function generateQualityImage(
    imagepath: string,
    outputpath: string,
    tier: GeneratedQualityMode,
): Promise<string> {
    await writeQualityWebp(imagepath, outputpath, tier);
    return outputpath;
}

async function writeQualityWebp(
    imagepath: string,
    outputpath: string,
    tier: GeneratedQualityMode,
): Promise<void> {
    const settings = QUALITY_TIER_SETTINGS[tier];
    const webpOptions = buildWebpOptions(settings);
    let pipeline = sharp(imagepath, TRUSTED_IMAGE_INPUT);

    if (settings.width) {
        pipeline = pipeline.resize({ width: settings.width });
    } else {
        const metadata = await sharp(imagepath, TRUSTED_IMAGE_INPUT).metadata();
        const width = metadata.width;
        const height = metadata.height;
        if (width && height) {
            const target = fitMediumPreviewSize(width, height);
            if (target.width !== width || target.height !== height) {
                pipeline = pipeline.resize({
                    width: target.width,
                    height: target.height,
                    fit: 'fill',
                });
            }
        }
    }

    await pipeline.webp(webpOptions).toFile(outputpath);
}

export async function generateQualityFromId(
    id: string,
    tier: GeneratedQualityMode,
    file?: string,
) {
    const imagepath = file ?? getImage(id)?.file;
    if (!imagepath) return;
    if (skipGeneration(imagepath)) return;
    const output = path.join(qualityTierPaths[tier], `${id}.webp`);
    const stats = await fs.stat(output).catch(() => undefined);
    if (stats?.isFile()) return;
    console.log(`Generating ${tier} preview for ${id}`);
    await generateQualityImage(imagepath, output, tier).catch(async () => {
        console.log(`Failed to generate ${tier} preview, retrying...`);
        await sleep(200);
        await generateQualityImage(imagepath, output, tier).catch(handleGenerationError(output));
    });
}

/** @deprecated use generateQualityFromId with tier 'medium' */
export async function generateCompressedFromId(id: string, file?: string) {
    return generateQualityFromId(id, 'medium', file);
}

/** @deprecated use generateQualityFromId with tier 'low' */
export async function generateThumbnailFromId(id: string, file?: string) {
    return generateQualityFromId(id, 'low', file);
}

function handleGenerationError(output: string) {
    return async (error: unknown) => {
        console.error(error);
        await sleep(200);
        await fs.unlink(output).catch(() => undefined);
    }
}
