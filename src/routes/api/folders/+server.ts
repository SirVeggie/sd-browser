import { IMG_FOLDER } from '$env/static/private';
import { invalidAuth } from '$lib/server/auth.js';
import { success } from '$lib/server/responses';
import type { Folder, FoldersResponse } from '$lib/types/requests.js';
import fs from 'fs/promises';
import path from 'path';

const root = IMG_FOLDER;

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;
    const result = await startRecurse();
    return success({
        folders: result,
    } as FoldersResponse);
}

async function startRecurse(): Promise<Folder[]> {
    const result: Folder[] = [];

    const files = await fs.readdir(root);
    for (const file of files) {
        const fullpath = path.join(root, file);
        try {
            const stats = await fs.stat(fullpath);
            if (!stats.isDirectory()) continue;
            result.push(await recurse(file, ''));
        } catch {
            // failed
        }
    }

    return result;
}

async function recurse(name: string, parent: string): Promise<Folder> {
    const folder: Folder = {
        name,
        parent,
        subfolders: [],
    };

    const files = await fs.readdir(path.join(root, parent, name));

    for (const file of files) {
        const fullpath = path.join(root, parent, name, file);
        try {
            const stats = await fs.stat(fullpath);
            if (!stats.isDirectory()) continue;
            folder.subfolders.push(await recurse(file, path.join(parent, name)));
        } catch {
            // failed
        }
    }
    
    return folder;
}