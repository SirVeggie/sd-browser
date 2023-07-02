import { IMG_FOLDER } from '$env/static/private';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { ImageList, ServerError } from '$lib/types';

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
                metadata: readMetadata(fullpath),
            };
        }

        for (const file of files.filter(x => !x.endsWith('.png'))) {
            const stats = await stat(path.join(dir, file));
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

function readMetadata(imagepath: string) {
    return '';
}