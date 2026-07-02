import sharp from 'sharp';
import fs from 'fs/promises';
import { isVideo } from '$lib/tools/misc';
import { fileExistsSync } from './filetools';

export type MediaDimensions = {
    width: number;
    height: number;
};

export async function readImageDimensions(filepath: string): Promise<MediaDimensions | undefined> {
    try {
        const meta = await sharp(filepath).metadata();
        if (meta.width && meta.height) {
            return { width: meta.width, height: meta.height };
        }
    } catch {
        // sharp could not read the file
    }
    return undefined;
}

async function readMp4Dimensions(filepath: string): Promise<MediaDimensions | undefined> {
    const handle = await fs.open(filepath, 'r');
    try {
        const { size } = await handle.stat();
        const chunkSize = Math.min(size, 512 * 1024);
        const start = Buffer.alloc(chunkSize);
        await handle.read(start, 0, chunkSize, 0);

        let dims = findTkhdDimensions(start);
        if (dims) return dims;

        if (size > chunkSize) {
            const end = Buffer.alloc(chunkSize);
            await handle.read(end, 0, chunkSize, size - chunkSize);
            dims = findTkhdDimensions(end);
            if (dims) return dims;
        }
    } catch {
        return undefined;
    } finally {
        await handle.close();
    }
    return undefined;
}

function findTkhdDimensions(buffer: Buffer, start = 0, end = buffer.length): MediaDimensions | undefined {
    let offset = start;
    while (offset + 8 <= end) {
        let size = buffer.readUInt32BE(offset);
        let headerSize = 8;
        if (size === 1 && offset + 16 <= end) {
            size = Number(buffer.readBigUInt64BE(offset + 8));
            headerSize = 16;
        }
        if (size < headerSize) break;

        const atomEnd = Math.min(offset + size, end);
        const atomType = buffer.toString('ascii', offset + 4, offset + 8);

        if (atomType === 'tkhd') {
            const dims = parseTkhdDimensions(buffer, offset + headerSize, atomEnd);
            if (dims) return dims;
        } else if (atomType === 'moov' || atomType === 'trak' || atomType === 'mdia') {
            const dims = findTkhdDimensions(buffer, offset + headerSize, atomEnd);
            if (dims) return dims;
        }

        if (size === 0) break;
        offset += size;
    }
    return undefined;
}

function parseTkhdDimensions(buffer: Buffer, start: number, end: number): MediaDimensions | undefined {
    if (start >= end) return undefined;

    const version = buffer[start];
    let widthOffset: number;
    let heightOffset: number;

    if (version === 0) {
        widthOffset = start + 76;
        heightOffset = start + 80;
    } else if (version === 1) {
        widthOffset = start + 88;
        heightOffset = start + 92;
    } else {
        return undefined;
    }

    if (heightOffset + 4 > end) return undefined;

    const width = buffer.readUInt32BE(widthOffset) / 65536;
    const height = buffer.readUInt32BE(heightOffset) / 65536;
    if (width <= 0 || height <= 0) return undefined;

    return { width: Math.round(width), height: Math.round(height) };
}

export async function readMediaDimensions(filepath: string): Promise<MediaDimensions | undefined> {
    if (!fileExistsSync(filepath)) {
        return undefined;
    }

    if (isVideo(filepath)) {
        const previewPath = filepath.replace(/\.\w+$/i, '.png');
        if (fileExistsSync(previewPath)) {
            const previewDims = await readImageDimensions(previewPath);
            if (previewDims) return previewDims;
        }
        return readMp4Dimensions(filepath);
    }

    return readImageDimensions(filepath);
}

export async function populateMediaDimensions<T extends { file: string; width?: number; height?: number }>(
    image: T,
): Promise<T> {
    if (image.width && image.height) {
        return image;
    }
    const dims = await readMediaDimensions(image.file);
    if (dims) {
        image.width = dims.width;
        image.height = dims.height;
    }
    return image;
}
