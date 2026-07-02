import { invalidAuth } from '$lib/server/auth.js';
import { imgFolder } from '$lib/server/paths';
import { success } from '$lib/server/responses';
import { stringSortSingle } from '$lib/tools/misc';
import type { FoldersResponse } from '$lib/types/requests.js';
import fs from 'fs/promises';
import path from 'path';

const root = imgFolder;
const folderRegex = /^\.?[^.]+$/;

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;
    const paths = await collectFolderPaths();
    return success({
        paths,
    } as FoldersResponse);
}

function formatFolderPath(parent: string, name: string): string {
    return `${parent}/${name}`.replace(/^\//, '').replace(/\\/, '/');
}

async function listSubdirs(dirPath: string): Promise<string[]> {
    const files = await fs.readdir(dirPath);
    const subdirs: string[] = [];

    await Promise.all(
        files.filter((x) => folderRegex.test(x)).map(async (file) => {
            const fullpath = path.join(dirPath, file);
            try {
                const stats = await fs.stat(fullpath);
                if (stats.isDirectory()) subdirs.push(file);
            } catch {
                // failed
            }
        }),
    );

    return subdirs.sort(stringSortSingle);
}

async function walkFolder(name: string, parent: string): Promise<string[]> {
    const paths = [formatFolderPath(parent, name)];
    const subdirs = await listSubdirs(path.join(root, parent, name));
    const childPaths = await Promise.all(
        subdirs.map((file) => walkFolder(file, path.join(parent, name))),
    );

    for (const child of childPaths) {
        paths.push(...child);
    }

    return paths;
}

async function collectFolderPaths(): Promise<string[]> {
    const paths: string[] = ['/'];
    const topDirs = await listSubdirs(root);
    const childPaths = await Promise.all(topDirs.map((file) => walkFolder(file, '')));

    for (const child of childPaths) {
        paths.push(...child);
    }

    return paths;
}
