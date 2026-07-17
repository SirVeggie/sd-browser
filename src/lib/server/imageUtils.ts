import { getMetadataVersion, getModels, getPrompts, simplifyPrompt } from "$lib/tools/metadataInterpreter";
import type { ImageExtraData, ImageInfo, ServerImage, ServerImageFull } from "$lib/types/images";
import { folderFromFile } from "./filetools";
import { isMetadataFiletype, isVideo } from '$lib/tools/misc';
import crypto from 'crypto';
import exifr from 'exifr';
import fs from 'fs/promises';
import { fileExists, removeBasePath } from "./filetools";
import { MetaDB } from "./db";
import { populateMediaDimensions } from "./imageDimensions";
import { computeExtradataFromFull } from "./extradataComputeCore";

/** Defer shipping blobs when combined length exceeds this (32 KiB). */
export const METADATA_BLOBS_DEFER_THRESHOLD = 32 * 1024;

export function shouldDeferMetadataBlobs(
    prompt: string | undefined,
    workflow: string | undefined,
    extra: string | undefined,
): boolean {
    if (getMetadataVersion(prompt) === 'comfy')
        return true;
    const length = (prompt?.length ?? 0) + (workflow?.length ?? 0) + (extra?.length ?? 0);
    return length > METADATA_BLOBS_DEFER_THRESHOLD;
}

export function getServerImage(image: ServerImageFull): ServerImage {
    const extra = computeExtradataFromFull(image);
    return {
        id: image.id,
        file: image.file,
        folder: folderFromFile(image.file),
        createdDate: image.createdDate,
        modifiedDate: image.modifiedDate,
        preview: image.preview,
        positive: extra.positive,
        negative: extra.negative,
        params: extra.params,
        models: extra.models,
        hash: extra.hash,
        annotation: extra.annotation ?? '',
        tags: extra.tags ?? [],
        width: image.width,
        height: image.height,
    };
}

/** Modifies given reference */
export function populateServerImage(image: ServerImage, info: ImageExtraData): ServerImage {
    image.positive = info.positive;
    image.negative = info.negative;
    image.params = info.params;
    image.models = info.models ?? '';
    image.hash = info.hash;
    image.annotation = info.annotation ?? '';
    if (info.tags !== undefined)
        image.tags = info.tags ?? [];
    else if (image.tags === undefined)
        image.tags = [];
    return image;
}

export function hashPath(filepath: string) {
    const hash = crypto.createHash('sha256');
    hash.update(removeBasePath(filepath));
    return hash.digest('hex');
}

export function hashPrompt(image: ServerImage) {
    if (image.hash)
        return image;
    const prompt = simplifyPrompt(image);
    if (!prompt)
        return image;
    const hash = crypto.createHash('sha256');
    hash.update(prompt);
    image.hash = hash.digest('base64');
    return image;
}

export async function readMetadataFromFile(image: ServerImageFull, file: string): Promise<ServerImageFull> {
    const text = await fs.readFile(file, 'utf8');
    image.prompt = text;
    return image;
}

export async function readMetadataFromExif(image: ServerImageFull, altSource?: string): Promise<ServerImageFull> {
    const validSource = isMetadataFiletype(image.file) || isMetadataFiletype(altSource ?? "");
    if (!validSource)
        return image;
    const metadata = await exifr.parse(altSource || image.file, {
        ifd0: false,
        chunked: false,
    } as any);
    if (!metadata)
        return image;
    image.prompt = metadata.parameters ?? metadata.prompt ?? '';
    image.workflow = metadata.workflow ?? '';
    image.extra = metadata.extra ?? '';

    if (!image.prompt && !image.workflow && !image.extra) {
        image.prompt = JSON.stringify(metadata);
    }

    if (altSource)
        image.preview = altSource;
    return image;
}

export async function readMetadata(image: ServerImageFull, source?: string): Promise<ServerImageFull> {
    try {
        const stats = await fs.stat(image.file);
        image.modifiedDate = stats.mtimeMs;
        image.createdDate = stats.birthtimeMs;

        if (source) {
            return await readMetadataFromExif(image, source).catch(() => image);
        }

        if (isVideo(image.file)) {
            const candidate = image.file.replace(/\.\w+$/i, '.png');
            if (await fileExists(candidate)) {
                return await readMetadataFromExif(image, candidate).catch(() => image);
            }

            return image;
        }

        const filetypes = ['.txt', '.yaml', '.yml', '.json'];
        for (const filetype of filetypes) {
            const candidate = image.file.replace(/\.\w+$/i, filetype);
            if (await fileExists(candidate)) {
                const text = await fs.readFile(candidate, 'utf8');
                image.prompt = text;
                return image;
            }
        }

        return readMetadataFromExif(image);
    } catch {
        console.log(`Failed to read metadata for ${image.file}`);
        return image;
    } finally {
        await populateMediaDimensions(image);
    }
}

export async function updateImageMetadata(image: ServerImage, source: string) {
    const newFull = await readMetadata({
        id: image.id,
        file: image.file,
        folder: folderFromFile(image.file),
        createdDate: image.createdDate,
        modifiedDate: image.modifiedDate,
        preview: image.preview,
        prompt: '',
        workflow: '',
        extra: '',
    }, source);
    image.preview = source;
    const newImage = getServerImage(newFull);
    image.positive = newImage.positive;
    image.negative = newImage.negative;
    image.params = newImage.params;
    image.models = newImage.models;
    image.hash = newImage.hash;
    image.width = newFull.width;
    image.height = newFull.height;
}

export function buildImageInfo(
    image: ServerImage | undefined,
    options?: { includeBlobs?: boolean; },
): ImageInfo | undefined {
    if (!image)
        return undefined;
    const includeBlobs = options?.includeBlobs !== false;
    const full = includeBlobs ? MetaDB.getBlobs(image.id) : undefined;
    const info: ImageInfo = {
        id: image.id,
        createdDate: image.createdDate,
        modifiedDate: image.modifiedDate,
        folder: folderFromFile(image.file),
        positive: image.positive,
        negative: image.negative,
        params: image.params,
        models: image.models,
        annotation: image.annotation,
        tags: image.tags ?? [],
        width: image.width || undefined,
        height: image.height || undefined,
    };
    if (includeBlobs && full) {
        info.prompt = full.prompt;
        info.workflow = full.workflow;
        info.extra = full.extra;
    }
    return info;
}

/** Full info, or short + `blobsDeferred` when Comfy / oversized. */
export function buildImageInfoForClient(image: ServerImage | undefined): ImageInfo | undefined {
    const info = buildImageInfo(image, { includeBlobs: true });
    if (!info)
        return undefined;
    if (!shouldDeferMetadataBlobs(info.prompt, info.workflow, info.extra))
        return info;

    return {
        id: info.id,
        createdDate: info.createdDate,
        modifiedDate: info.modifiedDate,
        folder: info.folder,
        positive: info.positive,
        negative: info.negative,
        params: info.params,
        models: info.models,
        annotation: info.annotation,
        tags: info.tags,
        width: info.width,
        height: info.height,
        blobsDeferred: true,
    };
}