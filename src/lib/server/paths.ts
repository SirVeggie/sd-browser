import { env } from '$env/dynamic/private';
import fs from 'fs';
import path from 'path';

export const datapath = env.LOCAL_DATA ?? './localData';
export const imgFolder = env.IMG_FOLDER ?? '';
export const thumbnailPath = path.join(datapath, 'thumbnails');
export const compressedPath = path.join(datapath, 'compressed');

let pathsEnsured = false;

export function ensurePathsExist() {
    if (pathsEnsured)
        return;

    fs.mkdirSync(datapath, { recursive: true });
    fs.mkdirSync(thumbnailPath, { recursive: true });
    fs.mkdirSync(compressedPath, { recursive: true });
    if (imgFolder)
        fs.mkdirSync(imgFolder, { recursive: true });

    pathsEnsured = true;
}
