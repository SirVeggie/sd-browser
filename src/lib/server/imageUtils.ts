import { getParams, getPrompts, simplifyPrompt } from "$lib/tools/metadataInterpreter";
import type { ImageExtraData, ImageInfo, ServerImage, ServerImageFull } from "$lib/types/images";
import { isMetadataFiletype, isVideo } from '$lib/tools/misc';
import crypto from 'crypto';
import exifr from 'exifr';
import fs from 'fs/promises';
import { fileExists, removeBasePath } from "./filetools";
import { addUniqueImage, getImage, removeUniqueImage } from "./filemanager";
import { MetaDB } from "./db";

export function getServerImage(image: ServerImageFull): ServerImage {
    const prompts = getPrompts(image.prompt, image.workflow);
    const result: ServerImage = {
        id: image.id,
        file: image.file,
        folder: image.folder,
        createdDate: image.createdDate,
        modifiedDate: image.modifiedDate,
        preview: image.preview,
        positive: prompts?.pos ?? '',
        negative: prompts?.neg ?? '',
        params: getParams(image.prompt),
        hash: '',
        isUnique: -1,
    };
    hashPrompt(result);
    return result;
}

/** Modifies given reference */
export function populateServerImage(image: ServerImage, info: ImageExtraData): ServerImage {
    image.positive = info.positive;
    image.negative = info.negative;
    image.params = info.params;
    image.hash = info.hash;
    image.isUnique = info.isUnique;
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
    image.prompt = metadata.parameters ?? metadata.prompt ?? undefined;
    image.workflow = metadata.workflow ?? undefined;

    if (image.prompt === undefined && image.workflow === undefined) {
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
    }
}

export async function updateImageMetadata(image: ServerImage, source: string) {
    const newFull = await readMetadata({
        id: image.id,
        file: image.file,
        folder: image.folder,
        createdDate: image.createdDate,
        modifiedDate: image.modifiedDate,
        preview: image.preview,
        prompt: '',
        workflow: '',
    }, source);
    image.preview = source;
    const newImage = getServerImage(newFull);
    removeUniqueImage(image);
    addUniqueImage(newImage);
}

export function buildImageInfo(imageid: string): ImageInfo | undefined {
    const image = getImage(imageid);
    if (!image)
        return undefined;
    const full = MetaDB.get(imageid);
    return {
        id: image.id,
        createdDate: image.createdDate,
        modifiedDate: image.modifiedDate,
        folder: image.folder,
        positive: image.positive,
        negative: image.negative,
        params: image.params,
        prompt: full?.prompt,
        workflow: full?.workflow,
    };
}