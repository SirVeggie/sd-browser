import { Readable, PassThrough } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { compressedPath, getImage, thumbnailPath } from './filemanager';
import path from 'path';
import fs from 'fs/promises';

ffmpeg.setFfmpegPath(ffmpegPath.path);

export function convertImage(image: Readable, outputFormat: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const passthrough = new PassThrough();
        ffmpeg(image)
            // .outputOption('-quality 10')
            .outputFormat(outputFormat)
            .on('error', reject)
            .stream(passthrough, { end: true });
        passthrough.on('data', data => chunks.push(data));
        passthrough.on('error', reject);
        passthrough.on('end', () => {
            const originalImage = Buffer.concat(chunks);
            const editedImage = originalImage
                // copy everything after the last 4 bytes into the 4th position
                .copyWithin(4, -4)
                // trim off the extra last 4 bytes ffmpeg added
                .subarray(0, -4);
            return resolve(editedImage);
        });
    });
}

export function readCompressedImage(imagepath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const passthrough = new PassThrough();
        ffmpeg(imagepath)
            .on('error', reject)
            .outputFormat('webp')
            .stream(passthrough, { end: true });
        passthrough.on('error', reject);
        passthrough.on('data', data => chunks.push(data));
        passthrough.on('end', () => {
            const originalImage = Buffer.concat(chunks);
            const editedImage = originalImage
                // copy everything after the last 4 bytes into the 4th position
                .copyWithin(4, -4)
                // trim off the extra last 4 bytes ffmpeg added
                .subarray(0, -4);
            return resolve(editedImage);
        });
    });
}

export function bufferToStream(buffer: Buffer): Readable {
    const readable = new Readable();
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    readable._read = () => { };
    readable.push(buffer);
    readable.push(null);
    return readable;
}

// export async function readImageAsWebp(imagepath: string) {
//     const buffer = await fs.readFile(imagepath);
//     const stream = bufferToStream(buffer);
//     return await convertImage(stream, 'webp');
// }

export function generateThumbnail(imagepath: string, outputpath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        ffmpeg(imagepath)
            .outputOptions('-quality 80')
            .size('460x?')
            .on('error', reject)
            .on('end', () => resolve(outputpath))
            .saveToFile(outputpath);
    });
}

export function generateCompressed(imagepath: string, outputpath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        ffmpeg(imagepath)
            .outputOptions('-quality 90')
            .on('error', reject)
            .on('end', () => resolve(outputpath))
            .saveToFile(outputpath);
    });
}

export async function generateCompressedFromId(id: string, file?: string) {
    const imagepath = file ?? getImage(id)?.file;
    if (!imagepath) return;
    const output = path.join(compressedPath, `${id}.webp`);
    const stats = await fs.stat(output).catch(() => undefined);
    if (stats?.isFile()) return;
    console.log(`Generating preview for ${id}`);
    await generateCompressed(imagepath, output).catch(console.error);
}

export async function generateThumbnailFromId(id: string, file?: string) {
    const imagepath = file ?? getImage(id)?.file;
    if (!imagepath) return;
    const output = path.join(thumbnailPath, `${id}.webp`);
    const stats = await fs.stat(output).catch(() => undefined);
    if (stats?.isFile()) return;
    console.log(`Generating thumbnail for ${id}`);
    await generateThumbnail(imagepath, output).catch(console.error);
}