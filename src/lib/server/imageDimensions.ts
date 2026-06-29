import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import { isVideo } from '$lib/tools/misc';
import { fileExistsSync } from './filetools';

ffmpeg.setFfmpegPath(ffmpegPath.path);

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

export async function readProbeDimensions(filepath: string): Promise<MediaDimensions | undefined> {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filepath, (err, metadata) => {
            if (err) {
                resolve(undefined);
                return;
            }
            const stream = metadata.streams.find((s) => s.width && s.height);
            if (!stream?.width || !stream?.height) {
                resolve(undefined);
                return;
            }
            resolve({ width: stream.width, height: stream.height });
        });
    });
}

export async function readMediaDimensions(filepath: string): Promise<MediaDimensions | undefined> {
    if (!fileExistsSync(filepath)) {
        return undefined;
    }

    if (isVideo(filepath)) {
        return readProbeDimensions(filepath);
    }

    const sharpDims = await readImageDimensions(filepath);
    if (sharpDims) {
        return sharpDims;
    }

    return readProbeDimensions(filepath);
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
