import { env } from '$env/dynamic/private';
import fs from 'fs';
import path from 'path';
import type { GeneratedQualityMode } from '$lib/types/misc';

export const datapath = env.LOCAL_DATA ?? './localData';
export const imgFolder = env.IMG_FOLDER ?? '';

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

let pathsEnsured = false;

export function ensurePathsExist() {
    if (pathsEnsured)
        return;

    fs.mkdirSync(datapath, { recursive: true });
    fs.mkdirSync(mediumPath, { recursive: true });
    fs.mkdirSync(lowPath, { recursive: true });
    fs.mkdirSync(minimalPath, { recursive: true });
    if (imgFolder)
        fs.mkdirSync(imgFolder, { recursive: true });

    pathsEnsured = true;
}
