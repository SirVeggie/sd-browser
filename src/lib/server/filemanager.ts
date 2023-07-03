import { IMG_FOLDER } from '$env/static/private';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { ImageList, ServerError } from '$lib/types';
import fs from 'fs/promises';
import exifr from 'exifr';

export async function IndexFiles(): Promise<ImageList | ServerError> {
    const dirs: string[] = [IMG_FOLDER];
    const images: ImageList = {};

    while (dirs.length > 0) {
        const dir = dirs.pop();
        if (!dir) continue;
        const files = await readdir(dir);

        for (const file of files.filter(x => x.endsWith('.png'))) {
            const fullpath = path.join(dir, file);
            const hash = hashString(fullpath);
            images[hash] = {
                id: hash,
                file: fullpath,
                width: 0,
                height: 0,
                metadata: await readMetadata(fullpath),
            };
        }

        for (const file of files.filter(x => !x.endsWith('.png'))) {
            const stats = await stat(path.join(dir, file));
            console.log(`file ${file} | path ${path.join(dir, file)} | isDir ${stats.isDirectory()}`);
            if (stats.isDirectory()) dirs.push(file);
        }
    }
    return images;
}

function hashString(filepath: string) {
    const hash = crypto.createHash('sha256');
    hash.update(filepath);
    return hash.digest('hex');
}

async function readMetadata(imagepath: string) {
    try {
        const file = await fs.readFile(imagepath);
        const metadata = await exifr.parse(file);
        return metadata;
    } catch {
        console.log(`Failed to read metadata for ${imagepath}`);
        return {};
    }
}