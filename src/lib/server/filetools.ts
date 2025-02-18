import fs from 'fs/promises';

export async function fileExists(file: string): Promise<boolean> {
    return await fs.stat(file).then(x => x.isFile(), () => false);
}

export async function folderExists(file: string): Promise<boolean> {
    return await fs.stat(file).then(x => x.isDirectory(), () => false);
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