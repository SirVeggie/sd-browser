import { invalidAuth } from '$lib/server/auth.js';
import { getImageRoots, isMultiRoot } from '$lib/server/paths';
import { success } from '$lib/server/responses';
import { stringSortSingle } from '$lib/tools/misc';
import type { FoldersResponse } from '$lib/types/requests.js';
import fs from 'fs/promises';
import path from 'path';

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
    return `${parent}/${name}`.replace(/^\//, '').replace(/\\/g, '/');
}

async function listSubdirs(dirPath: string): Promise<string[]> {
    let files: string[];
    try {
        files = await fs.readdir(dirPath);
    } catch {
        return [];
    }
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

async function walkFolder(fsRoot: string, name: string, parent: string): Promise<string[]> {
    const paths = [formatFolderPath(parent, name)];
    const subdirs = await listSubdirs(path.join(fsRoot, parent, name));
    const childPaths = await Promise.all(
        subdirs.map((file) => walkFolder(fsRoot, file, path.join(parent, name))),
    );

    for (const child of childPaths) {
        paths.push(...child);
    }

    return paths;
}

async function collectFolderPaths(): Promise<string[]> {
    const roots = getImageRoots();
    if (!roots.length)
        return ['/'];

    if (!isMultiRoot()) {
        const root = roots[0].path;
        const paths: string[] = ['/'];
        const topDirs = await listSubdirs(root);
        const childPaths = await Promise.all(topDirs.map((file) => walkFolder(root, file, '')));
        for (const child of childPaths)
            paths.push(...child);
        return paths;
    }

    // Multi-root: namespace with root key (no global "/").
    const paths: string[] = [];
    for (const root of roots) {
        paths.push(root.key);
        const topDirs = await listSubdirs(root.path);
        const childPaths = await Promise.all(
            topDirs.map((file) => walkFolder(root.path, file, root.key)),
        );
        for (const child of childPaths)
            paths.push(...child);
    }
    return paths;
}
