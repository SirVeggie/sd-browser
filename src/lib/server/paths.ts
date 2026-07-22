import { env } from '$env/dynamic/private';
import fs from 'fs';
import path from 'path';
import type { GeneratedQualityMode } from '$lib/types/misc';

export const datapath = env.LOCAL_DATA ?? './localData';

/** One indexed image source tree. */
export type ImageRoot = {
    /** Stable key for hashing / folder namespacing when multiple roots are configured. */
    key: string;
    /** Absolute resolved filesystem path. */
    path: string;
};

function sanitizeRootKey(name: string): string {
    const cleaned = name
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return cleaned || 'root';
}

function parseImageRootsFromEnv(): ImageRoot[] {
    const foldersRaw = (env.IMG_FOLDERS ?? '').trim();
    const singleRaw = (env.IMG_FOLDER ?? '').trim();
    const rawEntries = foldersRaw
        ? foldersRaw.split(';').map((s) => s.trim()).filter(Boolean)
        : singleRaw
            ? [singleRaw]
            : [];

    const resolved: { path: string; baseKey: string }[] = [];
    const seenPaths = new Set<string>();

    for (const entry of rawEntries) {
        const resolvedPath = path.resolve(entry);
        const normalized = resolvedPath.toLowerCase();
        if (seenPaths.has(normalized))
            continue;
        seenPaths.add(normalized);
        resolved.push({
            path: resolvedPath,
            baseKey: sanitizeRootKey(path.basename(resolvedPath)),
        });
    }

    // Drop nested roots (one source inside another) — keep the outer path.
    const filtered = resolved.filter((candidate, index) => {
        for (let i = 0; i < resolved.length; i++) {
            if (i === index)
                continue;
            const other = resolved[i];
            const rel = path.relative(other.path, candidate.path);
            if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
                console.warn(
                    `Ignoring nested image source '${candidate.path}' (inside '${other.path}')`,
                );
                return false;
            }
        }
        return true;
    });

    const used = new Map<string, number>();
    return filtered.map((item) => {
        const n = (used.get(item.baseKey) ?? 0) + 1;
        used.set(item.baseKey, n);
        return {
            key: n === 1 ? item.baseKey : `${item.baseKey}_${n}`,
            path: item.path,
        };
    });
}

let cachedRoots: ImageRoot[] | undefined;

/** Configured image source roots (empty if none set). */
export function getImageRoots(): ImageRoot[] {
    if (!cachedRoots)
        cachedRoots = parseImageRootsFromEnv();
    return cachedRoots;
}

/**
 * Legacy single-folder env. Prefer {@link getImageRoots}.
 * Equals the first configured root path, or '' if none.
 */
export const imgFolder = getImageRoots()[0]?.path ?? '';

export const mediumPath = path.join(datapath, 'medium');
export const lowPath = path.join(datapath, 'low');
export const minimalPath = path.join(datapath, 'minimal');

/** @deprecated v4 and earlier */
export const legacyCompressedPath = path.join(datapath, 'compressed');
/** @deprecated v4 and earlier */
export const legacyThumbnailPath = path.join(datapath, 'thumbnails');

export const qualityTierPaths: Record<GeneratedQualityMode, string> = {
    medium: mediumPath,
    low: lowPath,
    minimal: minimalPath,
};

export function isMultiRoot(): boolean {
    return getImageRoots().length > 1;
}

/**
 * Longest-prefix match of an absolute path to a configured root.
 * Returns undefined if the path is outside all roots.
 */
export function resolveImageRoot(filepath: string): ImageRoot | undefined {
    const resolved = path.resolve(filepath);
    const roots = getImageRoots();
    let best: ImageRoot | undefined;
    let bestLen = -1;
    for (const root of roots) {
        if (resolved === root.path)
            return root;
        const rel = path.relative(root.path, resolved);
        if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
            if (root.path.length > bestLen) {
                best = root;
                bestLen = root.path.length;
            }
        }
    }
    return best;
}

let pathsEnsured = false;

export function ensurePathsExist() {
    if (pathsEnsured)
        return;

    fs.mkdirSync(datapath, { recursive: true });
    fs.mkdirSync(mediumPath, { recursive: true });
    fs.mkdirSync(lowPath, { recursive: true });
    fs.mkdirSync(minimalPath, { recursive: true });
    // Do not mkdir image source roots — they are external folders (e.g. SD outputs).

    pathsEnsured = true;
}
