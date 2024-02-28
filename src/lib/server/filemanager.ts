import { IMG_FOLDER } from '$env/static/private';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import os from 'os';
import cp from 'child_process';
import crypto from 'crypto';
import { searchKeywords, type ImageList, type MatchType, type SearchMode, type ServerImage, type SortingMethod } from '$lib/types';
import fs from 'fs/promises';
import exifr from 'exifr';
import { getNegativePrompt, getParams, getPositivePrompt } from '$lib/tools/metadataInterpreter';
import Watcher from 'watcher';
import type { WatcherOptions } from 'watcher/dist/types';
import { XOR, selectRandom, validRegex } from '$lib/tools/misc';
import _ from 'lodash';
import { generateCompressedFromId, generateThumbnailFromId } from './convert';

type TimedImage = {
    id: string;
    timestamp: number;
};

type UniqueImage = {
    id: string;
    prompt: string;
};

let watcher: Watcher | undefined;
let imageList: ImageList = new Map();
let freshList: TimedImage[] = [];
let uniqueList: Map<string, UniqueImage> = new Map();
const nsfwList: string[] = [];
const favoriteList: string[] = [];
const deletionList: TimedImage[] = [];
const freshLimit = 1000;

export const datapath = './localData';
export const thumbnailPath = path.join(datapath, 'thumbnails');
export const compressedPath = path.join(datapath, 'compressed');

export async function startFileManager() {
    await indexFiles();
    setupWatcher();
}

export async function indexFiles() {
    console.log('Indexing files...');
    const startTimestamp = Date.now();
    
    fs.mkdir(datapath).catch(() => '');
    fs.mkdir(thumbnailPath).catch(() => '');
    fs.mkdir(compressedPath).catch(() => '');

    // Read cached data
    let imageCache: ImageList | undefined;
    const images: ImageList = new Map();
    const cachefile = path.join(datapath, 'metadata.json');
    const tempcachefile = path.join(datapath, 'metadata-temp.json');
    try {
        const cache = await fs.readFile(cachefile);
        imageCache = new Map(JSON.parse(cache.toString()));
    } catch {
        imageCache = undefined;
    }

    const dirs: string[] = [IMG_FOLDER];

    while (dirs.length > 0) {
        const dir = dirs.pop();
        if (!dir) continue;
        const dirShort = removeBasePath(dir);
        console.log(`Indexing ${dir}`);
        const files = await readdir(dir);

        for (const file of files.filter(x => isImage(x))) {
            const fullpath = path.join(dir, file);
            const hash = hashString(fullpath);
            if (imageCache && imageCache.has(hash)) {
                images.set(hash, {
                    ...(imageCache.get(hash)!),
                    file: fullpath,
                });
                continue;
            }

            const metadata = await readMetadata(fullpath);
            images.set(hash, {
                id: hash,
                folder: dirShort,
                file: fullpath,
                modifiedDate: 0,
                createdDate: 0,
                ...metadata,
            });
        }

        for (const file of files.filter(x => !isImage(x))) {
            const fullpath = path.join(dir, file);
            try {
                const stats = await stat(fullpath);
                if (stats.isDirectory()) dirs.push(fullpath);
            } catch {
                console.log(`Failed to read ${fullpath}`);
            }
        }
    }

    console.log('Writing cache file... do not interrupt!');
    const cachePromise = fs.writeFile(tempcachefile, JSON.stringify([...images], null, 2)).catch(e => console.log(e));

    imageList = images;

    await cachePromise;
    await fs.rename(tempcachefile, cachefile).catch(e => console.log(e));
    console.log(`Indexed ${imageList.size} images in ${Math.round((Date.now() - startTimestamp) / 1000)}s`);

    cleanTempImages();
    createUniqueList();
}

function isImage(file: string) {
    return file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.webp');
}

async function cleanTempImages() {
    let count = 0;
    await fs.readdir(thumbnailPath).then(files => {
        for (const file of files) {
            const id = path.basename(file, '.webp');
            if (!imageList.has(id)) {
                count++;
                fs.unlink(path.join(thumbnailPath, file)).catch(() => '');
            }
        }
    });
    console.log(`Cleaned ${count} thumbnails`);
    count = 0;
    await fs.readdir(compressedPath).then(files => {
        for (const file of files) {
            const id = path.basename(file, '.webp');
            if (!imageList.has(id)) {
                count++;
                fs.unlink(path.join(compressedPath, file)).catch(() => '');
            }
        }
    });
    console.log(`Cleaned ${count} preview images`);
}

let genCount = 0;
const genLimit = 10;
let indexTimer: any;

function setupWatcher() {
    const options: WatcherOptions = {
        recursive: true,
        ignoreInitial: true,
    };

    if (watcher) watcher.close();
    watcher = new Watcher(IMG_FOLDER, options);

    watcher.on('add', async file => {
        if (!isImage(file)) return;
        const hash = hashString(file);
        if (genCount < genLimit) {
            genCount++;
            await generateCompressedFromId(hash, file);
            await generateThumbnailFromId(hash, file);
            genCount--;
        }
        console.log(`Added ${file}`);
        imageList.set(hash, {
            id: hash,
            folder: path.basename(path.dirname(file)),
            file,
            modifiedDate: 0,
            createdDate: 0,
            ...await readMetadata(file),
        });

        const amount = freshList.unshift({
            id: hash,
            timestamp: Date.now(),
        });
        if (amount > freshLimit) freshList.pop();

        addUniqueImage(imageList.get(hash)!);
    });

    watcher.on('rename', async (from, to) => {
        if (isImage(from)) {
            const oldhash = hashString(from);
            imageList.delete(oldhash);
            removeUniqueImage(oldhash);
        }

        if (!isImage(to)) return;
        const newhash = hashString(to);
        imageList.set(newhash, {
            id: newhash,
            folder: path.basename(path.dirname(to)),
            file: to,
            modifiedDate: 0,
            createdDate: 0,
            ...await readMetadata(to),
        });

        addUniqueImage(imageList.get(newhash)!);
    });

    watcher.on('unlink', async file => {
        if (!isImage(file)) return;
        const hash = hashString(file);
        imageList.delete(hash);
        removeUniqueImage(hash);
        freshList = freshList.filter(x => x.id !== hash);
        const size = deletionList.unshift({
            id: hash,
            timestamp: Date.now(),
        });
        if (size > freshLimit) deletionList.pop();
    });

    watcher.on('addDir', () => {
        clearTimeout(indexTimer);
        indexTimer = setTimeout(() => {
            indexFiles();
        }, 2000);
    });

    watcher.on('renameDir', () => {
        clearTimeout(indexTimer);
        indexTimer = setTimeout(() => {
            indexFiles();
        }, 2000);
    });

    watcher.on('unlinkDir', dir => {
        for (const [key, value] of imageList) {
            if (value.file.startsWith(dir)) {
                imageList.delete(key);
                removeUniqueImage(key);
            }
        }
    });

    console.log('Listening to file changes...');
}

export function getImage(imageid: string) {
    const image = imageList.get(imageid);
    return image;
}

export function searchImages(search: string, filters: string[], mode: SearchMode, collapse?: boolean, timestamp?: number) {
    if (mode === 'regex' && !validRegex(search))
        return [];
    const matcher = buildMatcher(search, mode);
    const filter = buildMatcher(filters.join(' AND '), 'regex');
    let list: ServerImage[] = [];
    let source: ServerImage[] = [];

    if (timestamp) {
        source = getFreshImages(timestamp);
    } else {
        source = [...imageList.values()];
    }

    for (const value of source) {
        if (matcher(value) && filter(value)) {
            list.push(value);
        }
    }

    if (collapse) {
        list = list.filter(x => uniqueList.has(x.id));
    }

    return list;
}

function simplifyPrompt(prompt: string | undefined) {
    if (prompt === undefined) return '';
    return prompt
        .replace(/(, )?seed: \d+/i, '')
        .replace(/(, )?([^,]*)version: [^,]*/ig, '');
}

function createUniqueList() {
    let list: UniqueImage[] = [...imageList.values()].map(x => ({
        id: x.id,
        prompt: simplifyPrompt(x.prompt),
    }));

    list = _.uniqBy(list, x => x.prompt);
    uniqueList = new Map(list.map(x => [x.id, x]));
    console.log(`Unique list created with ${list.length} items`);
}

function addUniqueImage(image: ServerImage) {
    const prompt = simplifyPrompt(image.prompt);
    const unique = [...uniqueList.values()].find(x => x.prompt === prompt);
    if (unique)
        uniqueList.delete(unique.id);
    uniqueList.set(image.id, {
        id: image.id,
        prompt,
    });
}

function removeUniqueImage(id: string) {
    uniqueList.delete(id);
}

const keywordRegex = `((${searchKeywords.join('|')}) )*`;
const removeRegex = new RegExp(`^${keywordRegex}`);
const notRegex = new RegExp(`^${keywordRegex}NOT `);
const allRegex = new RegExp(`^${keywordRegex}ALL `);
const negativeRegex = new RegExp(`^${keywordRegex}(NEGATIVE|NEG) `);
const folderRegex = new RegExp(`^${keywordRegex}(FOLDER|FD) `);
const paramRegex = new RegExp(`^${keywordRegex}(PARAMS|PR) `);
function buildMatcher(search: string, matching: SearchMode): (image: ServerImage) => boolean {
    const parts = search.split(' AND ');
    const regexes = parts.map(x => {
        const raw = x.replace(removeRegex, '');

        let type: MatchType = 'positive';
        if (allRegex.test(x)) type = 'all';
        else if (negativeRegex.test(x)) type = 'negative';
        else if (folderRegex.test(x)) type = 'folder';
        else if (paramRegex.test(x)) type = 'params';

        return {
            raw,
            regex: new RegExp(raw, 'i'),
            not: x.match(notRegex),
            type,
        };
    });

    return (image: ServerImage) => {
        return !regexes.some(x => {
            const text = getTextByType(image, x.type);

            if (matching === 'contains') {
                return !XOR(x.not, text.toLowerCase().includes(x.raw.toLowerCase()));
            } else if (matching === 'words') {
                const words = x.raw.split(' ');
                return !XOR(x.not, words.every(word => new RegExp(`\\b${word}\\b`, 'i').test(text)));
            } else {
                return !XOR(x.not, x.regex.test(text));
            }
        });
    };
}

function getTextByType(image: ServerImage, type: MatchType) {
    if (!image) return '';
    switch (type) {
        case 'all':
            return `${image.prompt}, Folder: ${image.folder}`;
        case 'positive':
            return getPositivePrompt(image.prompt);
        case 'negative':
            return getNegativePrompt(image.prompt);
        case 'params':
            return getParams(image.prompt);
        case 'folder':
            return image.folder;
        default:
            return '';
    }
}

export function sortImages(images: ServerImage[], sort: SortingMethod): ServerImage[] {
    if (images.length === 0) return images;
    switch (sort) {
        case 'date':
            return [...images].sort(createComparer<ServerImage>(x => x.modifiedDate, true));
        case 'date (asc)':
            return [...images].sort(createComparer<ServerImage>(x => x.modifiedDate, false));
        case 'name':
            return [...images].sort(createComparer<ServerImage>(x => x.file, true));
        case 'name (desc)':
            return [...images].sort(createComparer<ServerImage>(x => x.file, false));
        case 'random':
            return selectRandom(images, images.length);
        default:
            return [];
    }
}

export function getFreshImages(timestamp: number) {
    // return [...imageList.values()].filter(x => x.modifiedDate > timestamp);
    // return freshList.map(x => imageList.get(x)).filter(x => (x?.modifiedDate ?? 0) > timestamp) as ServerImage[];
    const res: ServerImage[] = [];
    for (const item of freshList) {
        const img = imageList.get(item.id);
        if (!img) continue;
        if (item.timestamp <= timestamp) {
            break;
        }

        res.push(img);
    }
    return res;
}

export function getFreshImageTimestamp(id: string) {
    if (!id) return undefined;
    const item = freshList.find(x => x.id === id);
    return item?.timestamp;
}

export function getDeletedImageIds(timestamp: number) {
    const res: string[] = [];
    for (const deletion of deletionList) {
        if (deletion.timestamp <= timestamp) {
            break;
        }

        res.push(deletion.id);
    }
    return res;
}

function createComparer<T>(selector: (a: T) => any, descending: boolean) {
    return (a: T, b: T) => {
        return selector(a) < selector(b)
            ? (descending ? 1 : -1)
            : selector(a) > selector(b)
                ? (descending ? -1 : 1)
                : 0;
    };
}

function hashString(filepath: string) {
    const hash = crypto.createHash('sha256');
    hash.update(removeBasePath(filepath));
    return hash.digest('hex');
}

function removeBasePath(filepath: string) {
    filepath = filepath.replace(/(\/|\\)+$/, '');
    return filepath.replace(IMG_FOLDER, '');
}

async function readMetadata(imagepath: string): Promise<Partial<ServerImage>> {
    try {
        const stats = await stat(imagepath);
        const res: Partial<ServerImage> = {
            modifiedDate: stats.mtimeMs,
            createdDate: stats.birthtimeMs,
        };

        const filetypes = ['.txt', '.yaml', '.yml', '.json'];
        for (const filetype of filetypes) {
            const textfile = imagepath.replace(/\.(png|jpg|jpeg|webp)$/i, filetype);
            if (await fs.stat(textfile).then(x => x.isFile()).catch(() => false)) {
                const text = await fs.readFile(textfile, 'utf8');
                res.prompt = text;
                return res;
            }
        }

        const file = await fs.readFile(imagepath);
        let metadata = await exifr.parse(file);
        if (!metadata)
            return {};
        metadata = {
            ...res,
            prompt: metadata.parameters ?? metadata.prompt ?? undefined,
            workflow: metadata.workflow ?? undefined,
        } satisfies Partial<ServerImage>;

        if (metadata.prompt === undefined && metadata.workflow === undefined) {
            metadata.prompt = JSON.stringify(metadata);
        }

        return metadata;
    } catch {
        console.log(`Failed to read metadata for ${imagepath}`);
        return {};
    }
}

export function markNsfw(ids: string | string[], nsfw: boolean) {
    if (typeof ids === 'string') ids = [ids];

    for (const id of ids) {
        const index = nsfwList.indexOf(id);
        if (nsfw && index === -1) {
            nsfwList.push(id);
        } else if (!nsfw && index !== -1) {
            nsfwList.splice(index, 1);
        }
    }
}

export function markFavorite(ids: string | string[], favorite: boolean) {
    if (typeof ids === 'string') ids = [ids];

    for (const id of ids) {
        const index = favoriteList.indexOf(id);
        if (favorite && index === -1) {
            favoriteList.push(id);
        } else if (!favorite && index !== -1) {
            favoriteList.splice(index, 1);
        }
    }
}

export function deleteImages(ids: string | string[]) {
    if (typeof ids === 'string') ids = [ids];

    let failcount = 0;
    for (const id of ids) {
        const img = imageList.get(id);
        if (!img) return;
        try {
            fs.unlink(img.file);
            imageList.delete(id);
            removeUniqueImage(id);
            deleteTextFiles(img.file);
        } catch {
            failcount++;
        }
    }

    if (failcount > 0)
        console.log(`Failed to delete ${failcount} images`);
}

async function deleteTextFiles(imagepath: string) {
    const filetypes = ['.txt', '.yaml', '.yml', '.json'];
    for (const filetype of filetypes) {
        const textfile = imagepath.replace(/\.(png|jpg|jpeg|webp)$/i, filetype);
        fs.unlink(textfile).catch(() => '');
    }
}

export function openExplorer(id: string) {
    const filepath = imageList.get(id)?.file;
    if (!filepath) return;
    let folderpath = path.dirname(filepath);
    let cmd = '';
    switch (os.platform().toLowerCase().replace(/[0-9]/g, '').replace('darwin', 'macos')) {
        case 'win':
            folderpath = folderpath || '=';
            cmd = 'explorer';
            break;
        case 'linux':
            folderpath = folderpath || '/';
            cmd = 'xdg-open';
            break;
        case 'macos':
            folderpath = folderpath || '/';
            cmd = 'open';
            break;
    }
    const args = [];
    if (cmd === 'explorer') {
        args.push(`/select,`);
        args.push(filepath);
    } else {
        args.push(folderpath);
    }
    console.log(`Opening folder with args ${args.join(' ')}`);
    const p = cp.spawn(cmd, args);
    p.on('error', () => {
        p.kill();
    });
}
