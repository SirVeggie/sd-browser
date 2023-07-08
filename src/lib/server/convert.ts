import { Readable, PassThrough } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import fs from 'fs/promises';

ffmpeg.setFfmpegPath(ffmpegPath.path);

export function convertImage(image: Readable, outputFormat: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const passthrough = new PassThrough();
        ffmpeg()
            .input(image)
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
                .slice(0, -4);
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

export async function readImageAsWebp(imagepath: string) {
    const buffer = await fs.readFile(imagepath);
    const stream = bufferToStream(buffer);
    return await convertImage(stream, 'webp');
}