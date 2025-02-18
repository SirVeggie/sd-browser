import fs from 'fs/promises';

export async function fileExists(file: string): Promise<boolean> {
    return await fs.stat(file).then(x => x.isFile(), () => false);
}

export async function folderExists(file: string): Promise<boolean> {
    return await fs.stat(file).then(x => x.isDirectory(), () => false);
}

/**
 * Returns [left part, extension], so for example ['folder/textfile', '.txt']
 */
export function splitExtension(file: string): [string, string] {
    return file.split(/(?=\.\w+$)/) as [string, string];
}