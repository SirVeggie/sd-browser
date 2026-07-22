import fs from 'fs/promises';
import fsSync from 'fs';
import { getImageRoots, isMultiRoot, qualityTierPaths, resolveImageRoot, type ImageRoot } from './paths';
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

export type ResolvedImagePath = {
    root: ImageRoot;
    /** Path relative to the root (OS separators from path.relative). Empty at the root itself. */
    relative: string;
};

/**
 * Resolve an absolute path to its configured image root and relative path.
 */
export function resolveImagePath(filepath: string): ResolvedImagePath | undefined {
    filepath = filepath.replace(/(\/|\\)+$/, '');
    const root = resolveImageRoot(filepath);
    if (!root)
        return undefined;
    const resolved = path.resolve(filepath);
    if (resolved === root.path)
        return { root, relative: '' };
    const relative = path.relative(root.path, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative))
        return undefined;
    return { root, relative };
}

/**
 * Remove the image root folder from the file path (relative path under the matching root).
 * Preserves path.relative separators for hash compatibility with single-root installs.
 */
export function removeBasePath(filepath: string): string {
    const resolved = resolveImagePath(filepath);
    if (resolved)
        return resolved.relative;
    // Fallback for odd layouts / unresolved roots (legacy string replace).
    const roots = getImageRoots();
    if (roots.length === 1)
        return filepath.replace(roots[0].path, '').replace(/^(\/|\\)/, '');
    return filepath;
}

/**
 * Relative folder path under the image root (empty string for single-root root).
 * Uses forward slashes to match /api/folders paths.
 * With multiple roots, prefixes with the root key (`outputs/txt2img`).
 */
export function folderFromDir(dir: string): string {
    const resolved = resolveImagePath(dir);
    if (!resolved) {
        return removeBasePath(dir).replace(/^(\/|\\)/, '').replace(/\\/g, '/');
    }
    const rel = resolved.relative.replace(/\\/g, '/').replace(/^\/+/, '');
    if (isMultiRoot())
        return rel ? `${resolved.root.key}/${rel}` : resolved.root.key;
    return rel;
}

export function folderFromFile(file: string): string {
    return folderFromDir(path.dirname(file));
}

export type TargetFolderResult =
    | { ok: true; root: ImageRoot; absolute: string; folder: string }
    | { ok: false; error: string };

/**
 * Resolve a UI/API folder string to an absolute directory under a configured root.
 * Single-root: folder is relative to that root (`txt2img` or `/`).
 * Multi-root: first path segment is the root key (`outputs/txt2img`).
 */
export function resolveTargetFolder(folder: string): TargetFolderResult {
    const roots = getImageRoots();
    if (!roots.length)
        return { ok: false, error: 'No image source folders configured' };

    const cleaned = folder.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');

    if (roots.length === 1) {
        const root = roots[0];
        const absolute = cleaned ? path.join(root.path, cleaned) : root.path;
        return { ok: true, root, absolute, folder: cleaned };
    }

    if (!cleaned)
        return { ok: false, error: 'Select a folder under a specific source root' };

    const slash = cleaned.indexOf('/');
    const key = slash < 0 ? cleaned : cleaned.slice(0, slash);
    const rest = slash < 0 ? '' : cleaned.slice(slash + 1);
    const root = roots.find((r) => r.key === key);
    if (!root)
        return { ok: false, error: `Unknown source root '${key}'` };

    const absolute = rest ? path.join(root.path, rest) : root.path;
    return { ok: true, root, absolute, folder: cleaned };
}

/**
 * Return only the file
 */
export function removeFolderFromPath(file: string) {
    return file.match(/[^/\\]+(\/|\\)?$/)?.[0].replace(/(\/|\\)$/, '');
}

export async function deleteTempImage(id: string) {
    await Promise.all(
        Object.values(qualityTierPaths).map((tierPath) =>
            fs.unlink(path.join(tierPath, `${id}.webp`)).catch(() => ''),
        ),
    );
}
