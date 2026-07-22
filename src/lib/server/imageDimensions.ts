import sharp from 'sharp';
import fs from 'fs/promises';
import { orientedDisplaySize } from '$lib/tools/imageGeometry';
import { isVideo } from '$lib/tools/misc';
import { fileExistsSync } from './filetools';

export type MediaDimensions = {
    width: number;
    height: number;
};

export type Mp4TrackTransform = MediaDimensions & {
    /** Clockwise rotation from the tkhd matrix (0 / 90 / 180 / 270). */
    rotation: number;
};

export async function readImageDimensions(filepath: string): Promise<MediaDimensions | undefined> {
    try {
        const meta = await sharp(filepath, { failOn: 'truncated' }).metadata();
        if (meta.width && meta.height) {
            return orientedDisplaySize(meta.width, meta.height, meta.orientation);
        }
    } catch {
        // sharp could not read the file
    }
    return undefined;
}

/** Read display size + clockwise rotation from the MP4 track header matrix. */
export async function readMp4TrackTransform(filepath: string): Promise<Mp4TrackTransform | undefined> {
    const moov = await readMoovAtom(filepath);
    if (!moov)
        return undefined;
    return findTkhdTransform(moov);
}

async function readMp4Dimensions(filepath: string): Promise<MediaDimensions | undefined> {
    const transform = await readMp4TrackTransform(filepath);
    if (!transform) return undefined;
    return { width: transform.width, height: transform.height };
}

/** Walk top-level atoms and load the `moov` box (works when moov is after mdat). */
async function readMoovAtom(filepath: string): Promise<Buffer | undefined> {
    const handle = await fs.open(filepath, 'r');
    try {
        const { size } = await handle.stat();
        let offset = 0;
        while (offset + 8 <= size) {
            const header = Buffer.alloc(16);
            const readHeader = Math.min(16, size - offset);
            await handle.read(header, 0, readHeader, offset);

            let atomSize = header.readUInt32BE(0);
            let headerSize = 8;
            if (atomSize === 1) {
                if (readHeader < 16)
                    break;
                atomSize = Number(header.readBigUInt64BE(8));
                headerSize = 16;
            } else if (atomSize === 0) {
                atomSize = size - offset;
            }
            if (atomSize < headerSize)
                break;

            const type = header.toString('ascii', 4, 8);
            if (type === 'moov') {
                if (atomSize > 64 * 1024 * 1024)
                    return undefined;
                const moov = Buffer.alloc(atomSize);
                await handle.read(moov, 0, atomSize, offset);
                return moov;
            }

            offset += atomSize;
        }
    } catch {
        return undefined;
    } finally {
        await handle.close();
    }
    return undefined;
}

function findTkhdTransform(buffer: Buffer, start = 0, end = buffer.length): Mp4TrackTransform | undefined {
    let offset = start;
    while (offset + 8 <= end) {
        let size = buffer.readUInt32BE(offset);
        let headerSize = 8;
        if (size === 1 && offset + 16 <= end) {
            size = Number(buffer.readBigUInt64BE(offset + 8));
            headerSize = 16;
        } else if (size === 0) {
            size = end - offset;
        }
        if (size < headerSize) break;

        const atomEnd = Math.min(offset + size, end);
        const atomType = buffer.toString('ascii', offset + 4, offset + 8);

        if (atomType === 'tkhd') {
            const transform = parseTkhdTransform(buffer, offset + headerSize, atomEnd);
            // Prefer the first video-sized track (skip empty audio-style headers).
            if (transform) return transform;
        } else if (atomType === 'moov' || atomType === 'trak' || atomType === 'mdia') {
            const transform = findTkhdTransform(buffer, offset + headerSize, atomEnd);
            if (transform) return transform;
        }

        offset += size;
    }
    return undefined;
}

function parseTkhdTransform(buffer: Buffer, start: number, end: number): Mp4TrackTransform | undefined {
    if (start >= end) return undefined;

    const version = buffer[start];
    let matrixOffset: number;
    let widthOffset: number;
    let heightOffset: number;

    if (version === 0) {
        matrixOffset = start + 40;
        widthOffset = start + 76;
        heightOffset = start + 80;
    } else if (version === 1) {
        matrixOffset = start + 52;
        widthOffset = start + 88;
        heightOffset = start + 92;
    } else {
        return undefined;
    }

    if (heightOffset + 4 > end) return undefined;

    // Row-major 3x3: a b u / c d v / x y w  (u is at +8, c at +12)
    const a = buffer.readInt32BE(matrixOffset) / 65536;
    const b = buffer.readInt32BE(matrixOffset + 4) / 65536;
    const c = buffer.readInt32BE(matrixOffset + 12) / 65536;
    // ffmpeg av_display_rotation_get: -atan2(c, a)
    let rotation = snapRotationDegrees(-Math.atan2(c, a) * (180 / Math.PI));
    if ((a === 0 && c === 0) || Number.isNaN(rotation))
        rotation = snapRotationDegrees(Math.atan2(b, a) * (180 / Math.PI));

    let width = Math.round(buffer.readUInt32BE(widthOffset) / 65536);
    let height = Math.round(buffer.readUInt32BE(heightOffset) / 65536);
    if (width <= 0 || height <= 0) return undefined;

    // Real-world phone files often store coded (pre-rotation) size in tkhd with a
    // non-zero matrix. Swap so width/height match upright display.
    if (rotation === 90 || rotation === 270) {
        const swap = width;
        width = height;
        height = swap;
    }

    return { width, height, rotation };
}

function snapRotationDegrees(degrees: number): number {
    const snapped = Math.round(degrees / 90) * 90;
    return ((snapped % 360) + 360) % 360;
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
