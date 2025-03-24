import { IMG_FOLDER } from '$env/static/private';
import fs from 'fs/promises';
import fsSync from 'fs';
import { compressedPath, thumbnailPath } from './filemanager';
import path from 'path';

export async function fileExists(file: string): Promise<boolean> {
    return await fs.stat(file).then(x => x.isFile(), () => false);
}

export function fileExistsSync(file: string): boolean {
    return fsSync.existsSync(file);
}

export async function folderExists(file: string): Promise<boolean> {
    return await fs.stat(file).then(x => x.isDirectory(), () => false);
}

export async function deleteFile(file: string): Promise<boolean> {
    try {
        await fs.unlink(file);
        return true;
    } catch {
        return false;
    }
}

export function deleteFileSync(file: string): boolean {
    try {
        fsSync.unlinkSync(file);
        return true;
    } catch {
        return false;
    }
}

/**
 * Ensures a unique file name by using a random 6 digit postfix if necessary (-123456)
 */
export async function fileUniquefy(file: string): Promise<string> {
    const [left, right] = splitExtension(file);
    let newPath = file;
    while (await fileExists(newPath)) {
        // append a random 6 digit number to make the filename unique
        newPath = `${left}-${String(Date.now()).substring(7)}${right}`;
    }
    return newPath;
}

/**
 * Returns [left part, extension], so for example ['folder/textfile', '.txt']
 */
export function splitExtension(file: string): [string, string] {
    return file.split(/(?=\.\w+$)/) as [string, string];
}

/**
 * Remove IMG_FOLDER from the file path
 */
export function removeBasePath(filepath: string) {
    filepath = filepath.replace(/(\/|\\)+$/, '');
    return filepath.replace(IMG_FOLDER, '');
}

/**
 * Return only the file
 */
export function removeFolderFromPath(file: string) {
    return file.match(/[^/\\]+(\/|\\)?$/)?.[0].replace(/(\/|\\)$/, '');
}

export async function deleteTempImage(id: string) {
    const thumbfile = path.join(thumbnailPath, `${id}.webp`);
    const compfile = path.join(compressedPath, `${id}.webp`);
    await fs.unlink(thumbfile).catch(() => '');
    await fs.unlink(compfile).catch(() => '');
}