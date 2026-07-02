import sharp from 'sharp';
import { compressedPath, thumbnailPath } from './paths';
import { getImage } from './dataIndex';
import path from 'path';
import fs from 'fs/promises';
import { backgroundTasks } from './background';
import { sleep } from '$lib/tools/sleep';
import { skipGeneration } from '$lib/tools/misc';

const WEBP_FAST: sharp.WebpOptions = { effort: 0 };

export async function encodeImageForLlm(imagepath: string): Promise<Buffer> {
    return sharp(imagepath).jpeg({ quality: 80 }).toBuffer();
}

export function generateThumbnailTask(imagepath: string, outputpath: string): Promise<string> {
    return backgroundTasks.addWork(() => generateThumbnail(imagepath, outputpath), true);
}

export async function generateThumbnail(imagepath: string, outputpath: string): Promise<string> {
    await sharp(imagepath)
        .resize({ width: 460 })
        .webp({ quality: 80, ...WEBP_FAST })
        .toFile(outputpath);
    return outputpath;
}

export function generateCompressedTask(imagepath: string, outputpath: string): Promise<string> {
    return backgroundTasks.addWork(() => generateCompressed(imagepath, outputpath), true);
}

export async function generateCompressed(imagepath: string, outputpath: string): Promise<string> {
    await sharp(imagepath)
        .webp({ quality: 90, ...WEBP_FAST })
        .toFile(outputpath);
    return outputpath;
}

export async function generateCompressedFromId(id: string, file?: string) {
    const imagepath = file ?? getImage(id)?.file;
    if (!imagepath) return;
    if (skipGeneration(imagepath)) return;
    const output = path.join(compressedPath, `${id}.webp`);
    const stats = await fs.stat(output).catch(() => undefined);
    if (stats?.isFile()) return;
    console.log(`Generating preview for ${id}`);
    await generateCompressed(imagepath, output).catch(async () => {
        console.log("Failed to generate preview, retrying...");
        await sleep(200);
        await generateCompressed(imagepath, output).catch(handleGenerationError(output));
    });
}

export async function generateThumbnailFromId(id: string, file?: string) {
    const imagepath = file ?? getImage(id)?.file;
    if (!imagepath) return;
    if (skipGeneration(imagepath)) return;
    const output = path.join(thumbnailPath, `${id}.webp`);
    const stats = await fs.stat(output).catch(() => undefined);
    if (stats?.isFile()) return;
    console.log(`Generating thumbnail for ${id}`);
    await generateThumbnail(imagepath, output).catch(async () => {
        console.log("Failed to generate thumbnail, retrying...");
        await sleep(200);
        await generateThumbnail(imagepath, output).catch(handleGenerationError(output));
    });
}

function handleGenerationError(output: string) {
    return async (error: unknown) => {
        console.error(error);
        await sleep(200);
        await fs.unlink(output).catch(() => undefined);
    }
}
