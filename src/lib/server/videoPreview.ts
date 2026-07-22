import { Mp4Demuxer, VideoDecoder, type VideoFrame } from '@napi-rs/webcodecs';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileExists } from './filetools';
import { readMp4TrackTransform } from './imageDimensions';

const PREVIEW_CONCURRENCY = 2;
let active = 0;
const queue: Array<() => void> = [];

function videoPreviewPath(videoPath: string): string {
    return videoPath.replace(/\.\w+$/i, '.png');
}

async function withPreviewLimit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= PREVIEW_CONCURRENCY) {
        await new Promise<void>(resolve => queue.push(resolve));
    }
    active++;
    try {
        return await fn();
    } finally {
        active--;
        queue.shift()?.();
    }
}

function snapRotationDegrees(degrees: number): number {
    const snapped = Math.round(degrees / 90) * 90;
    return ((snapped % 360) + 360) % 360;
}

async function resolvePreviewRotation(videoPath: string, frame: VideoFrame): Promise<number> {
    const transform = await readMp4TrackTransform(videoPath);
    if (transform && transform.rotation)
        return transform.rotation;
    return snapRotationDegrees(frame.rotation ?? 0);
}

async function extractFirstFrameToPng(videoPath: string, outputPath: string): Promise<void> {
    let settled = false;
    let resolveFrame!: (frame: VideoFrame) => void;
    let rejectFrame!: (error: Error) => void;
    const framePromise = new Promise<VideoFrame>((resolve, reject) => {
        resolveFrame = resolve;
        rejectFrame = reject;
    });

    const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        rejectFrame(error);
    };

    const decoder = new VideoDecoder({
        output: (frame) => {
            if (settled) {
                frame.close();
                return;
            }
            settled = true;
            resolveFrame(frame);
        },
        error: (error) => fail(error instanceof Error ? error : new Error(String(error))),
    });

    const demuxer = new Mp4Demuxer({
        videoOutput: (chunk) => {
            if (!settled)
                decoder.decode(chunk);
        },
        error: (error) => fail(error instanceof Error ? error : new Error(String(error))),
    });

    try {
        await demuxer.load(videoPath);
        const config = demuxer.videoDecoderConfig;
        if (!config)
            throw new Error('No video track found');

        decoder.configure({
            codec: config.codec,
            codedWidth: config.codedWidth,
            codedHeight: config.codedHeight,
            description: config.description,
        });

        const feed = (async () => {
            while (!settled) {
                await demuxer.demuxAsync(32);
                if (demuxer.state === 'ended') {
                    await decoder.flush();
                    break;
                }
            }
        })();

        const frame = await Promise.race([
            framePromise,
            feed.then(async () => {
                if (!settled)
                    throw new Error('No video frame decoded');
                return framePromise;
            }),
        ]);

        try {
            const width = frame.codedWidth;
            const height = frame.codedHeight;
            const rgba = new Uint8Array(frame.allocationSize({ format: 'RGBA' }));
            await frame.copyTo(rgba, { format: 'RGBA' });

            const rotation = await resolvePreviewRotation(videoPath, frame);
            const tmpPath = `${outputPath}.tmp.png`;
            let pipeline = sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
                raw: { width, height, channels: 4 },
            });
            if (rotation)
                pipeline = pipeline.rotate(rotation);
            await pipeline.png().toFile(tmpPath);
            await fs.rename(tmpPath, outputPath);
        } finally {
            frame.close();
        }

        await feed.catch(() => undefined);
    } finally {
        try {
            demuxer.close();
        } catch {
            // already closed
        }
        try {
            if (decoder.state !== 'closed')
                decoder.close();
        } catch {
            // already closed
        }
    }
}

/** Ensure a companion PNG exists next to the video; generate first frame if missing. */
export async function ensureVideoPreview(videoPath: string): Promise<string | undefined> {
    const previewPath = videoPreviewPath(videoPath);
    if (await fileExists(previewPath))
        return previewPath;

    return withPreviewLimit(async () => {
        if (await fileExists(previewPath))
            return previewPath;

        try {
            console.log(`Generating video preview for ${path.basename(videoPath)}`);
            await extractFirstFrameToPng(videoPath, previewPath);
            return previewPath;
        } catch (error) {
            console.log(`Failed to generate video preview for ${path.basename(videoPath)}`);
            console.error(error);
            await fs.unlink(previewPath).catch(() => undefined);
            await fs.unlink(`${previewPath}.tmp.png`).catch(() => undefined);
            return undefined;
        }
    });
}
