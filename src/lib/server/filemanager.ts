import { IMG_FOLDER } from '$env/static/private';
import { env } from '$env/dynamic/private';
import path from 'path';
import os from 'os';
import cp from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import exifr from 'exifr';
import { getServerImage } from '$lib/tools/metadataInterpreter';
import Watcher from 'watcher';
import type { WatcherOptions } from 'watcher/dist/types';
import { XOR, calcTimeSpent, formatHasMetadata as isMetadataFiletype, isImage, isMedia, isTxt, isVideo, limitedParallelMap, print, printLine, removeExtension, selectRandom, updateLine, validRegex, videoFiletypes, unixTime } from '$lib/tools/misc';
import { generateCompressedFromId, generateThumbnailFromId } from './convert';
import { sleep } from '$lib/tools/sleep';
import { backgroundTasks } from './background';
import { MetaCalcDB, MetaDB } from './db';
import type { ImageInfo, ImageList, ServerImage, ServerImageFull } from '$lib/types/images';
import { searchKeywords, type MatchType, type SearchMode, type SortingMethod } from '$lib/types/misc';
import { fileExists, fileUniquefy, splitExtension } from './filetools';
import { handleLegacy } from './legacy';

type TimedImage = {
    id: string;
    timestamp: number;
};

const pollingInterval = Number(env.POLLING_SECONDS ?? 0) * 1000;

let watcher: Watcher | undefined;
let imageList: ImageList = new Map();
let freshList: TimedImage[] = [];
let uniqueSet: Set<string> = new Set();
let uniqueReverse: Map<string, string[]> = new Map();
const nsfwList: string[] = [];
const favoriteList: string[] = [];
const deletionList: TimedImage[] = [];
const freshLimit = 1000;

export const datapath = './localData';
export const thumbnailPath = path.join(datapath, 'thumbnails');
export const compressedPath = path.join(datapath, 'compressed');
export let generationDisabled = false;

export async function remoteDebug() {
    console.log(imageList.get([...imageList.keys()][10])?.positive);
}

export async function startFileManager() {
    await indexFiles();
    setupWatcher();
}

export async function indexFiles() {
    console.log(`Indexing files in ${IMG_FOLDER}`);
    const startTimestamp = Date.now();

    fs.mkdir(datapath).catch(() => '');
    fs.mkdir(thumbnailPath).catch(() => '');
    fs.mkdir(compressedPath).catch(() => '');

    // Read cached data
    // eslint-disable-next-line prefer-const
    let [templist, txtmap, cache, videomap] = await indexCachedFiles();

    // Initialize existing cache
    if (imageList.size) {
        print(`Building unique list for ${imageList.size} images...`);
        await createUniqueListChunked();
        updateLine(`Unique list created with ${uniqueSet.size} items\n`);
    }

    // Read modified and created dates
    if (templist.length !== 0) {
        templist = await indexBasicFileData(templist);
    }

    if (templist.length !== 0) {
        // sort
        print('Sorting remaining images by modified date...');
        templist.sort((a, b) => b.modifiedDate - a.modifiedDate);
        generationDisabled = true;

        // Read metadata from txt files
        templist = await indexTxtFiles(templist, txtmap);
    }

    // Read metadata from exif
    if (templist.length !== 0) {
        const originalLimit = backgroundTasks.limit;
        backgroundTasks.limit = 5;
        await indexExifFiles(templist, videomap);
        backgroundTasks.limit = originalLimit;
    }

    generationDisabled = false;

    // finish up
    print('Cleaning up...');
    deleteMissingImages([...imageList].map(x => x[1]), cache);
    cleanCalcDB();
    updateLine(`Indexed ${imageList.size} images in ${calcTimeSpent(startTimestamp)}\n`);
    await handleLegacy();

    cleanTempImages();
    console.log(`Found ${[...imageList].filter(x => x[1].positive).length} images with metadata`);
}

function deleteMissingImages(images: ServerImage[], cache: ImageList | undefined) {
    if (!cache) return;
    const deletions: string[] = [];

    for (const image of images) {
        cache.delete(image.id);
    }

    for (const [key] of cache) {
        deletions.push(key);
    }

    MetaDB.deleteAll(deletions);
    MetaCalcDB.deleteAll(deletions);
    updateLine(`deleted ${deletions.length} images in cache\n`);
}

async function indexCachedFiles(): Promise<[ServerImageFull[], Map<string, string>, ImageList | undefined, Map<string, string>]> {
    const templist: ServerImageFull[] = [];
    const images: ImageList = new Map();
    const dirs: string[] = [IMG_FOLDER];
    const set = new Set<string>();
    const videomap: Map<string, string> = new Map();
    const txtmap: Map<string, string> = new Map();
    let found = 0;
    let foundtxt = 0;
    let foundtxtnew = 0;

    const dbImages = MetaDB.getAllShort();
    const imageCache = dbImages.size ? dbImages : undefined;
    if (imageCache) {
        const missing = [];
        const dbInfo = MetaCalcDB.getAll();
        for (const info of dbInfo) {
            if (!imageCache.has(info.id)) {
                missing.push(info.id);
                continue;
            }

            const image = imageCache.get(info.id)!;
            image.positive = info.positive;
            image.negative = info.negative;
            image.params = info.params;
        }
        MetaCalcDB.deleteAll(missing);
    } else {
        MetaCalcDB.clearAll();
    }

    if (!imageCache) {
        console.log('No cache file, or failed to read it');
        console.log('Building index from scratch...');
    } else {
        console.log(`Found cache file with ${imageCache.size} images`);
    }

    while (dirs.length > 0) {
        const dir = dirs.pop();
        if (!dir) continue;
        const dirShort = removeBasePath(dir).replace(/^(\/|\\)/, '');
        const files = await fs.readdir(dir);

        for (const file of files.filter(x => isVideo(x))) {
            found++;
            const fullpath = path.join(dir, file);
            const partial = removeExtension(fullpath);
            const hash = hashPath(fullpath);

            videomap.set(partial, "");

            if (imageCache && imageCache.has(hash)) {
                images.set(hash, {
                    ...(imageCache.get(hash)!),
                    file: fullpath,
                });
                continue;
            }

            set.add(partial);

            templist.push({
                id: hash,
                folder: dirShort,
                file: fullpath,
                modifiedDate: 0,
                createdDate: 0,
                preview: '',
                prompt: '',
                workflow: '',
            });
        }

        for (const file of files.filter(x => isImage(x))) {
            found++;
            const fullpath = path.join(dir, file);
            const partial = removeExtension(fullpath);
            const hash = hashPath(fullpath);

            if (videomap.has(partial) && fullpath.endsWith('.png')) {
                videomap.set(partial, fullpath);
                continue;
            }

            if (imageCache && imageCache.has(hash)) {
                images.set(hash, {
                    ...(imageCache.get(hash)!),
                    file: fullpath,
                });
                continue;
            }

            set.add(partial);

            templist.push({
                id: hash,
                folder: dirShort,
                file: fullpath,
                modifiedDate: 0,
                createdDate: 0,
                preview: '',
                prompt: '',
                workflow: '',
            });
        }

        for (const file of files.filter(x => isTxt(x))) {
            foundtxt++;
            const fullpath = path.join(dir, file);
            const partial = removeExtension(fullpath);
            if (set.has(partial)) {
                foundtxtnew++;
                txtmap.set(partial, fullpath);
            }
        }

        for (const file of files.filter(x => !isMedia(x) && !isTxt(x))) {
            const fullpath = path.join(dir, file);
            try {
                const stats = await fs.stat(fullpath);
                if (stats.isDirectory()) dirs.push(fullpath);
            } catch {
                // failed
            }
        }

        updateLine(`Searching ${found} images` + (foundtxt ? ` and ${foundtxt} txt files` : ''));
    }

    updateLine(`Found ${found - images.size} new images` + (foundtxt ? ` and ${foundtxtnew} txt files` : '') + '\n');

    if (imageCache) {
        const deletions = [...imageCache.keys()].filter(x => !images.has(x));
        deletions.forEach(x => imageCache.delete(x));
    }

    imageList = images;
    return [templist, txtmap, imageCache, videomap];
}

async function indexBasicFileData(templist: ServerImageFull[]): Promise<ServerImageFull[]> {
    const log = `Reading dates for ${templist.length} images...`;
    print(log);
    let progress = 0;
    let count = 0;
    const startTimestamp = Date.now();
    const parallelBasicReads = 10;

    templist = await limitedParallelMap(templist, async x => {
        try {
            const stats = await fs.stat(x.file);
            x.modifiedDate = stats.mtimeMs;
            x.createdDate = stats.birthtimeMs;
            if (x.modifiedDate > 0) count++;
            return x;
        } catch {
            return x;
        } finally {
            progress++;
            if (progress % 1000 === 0) updateLine(log + ` ${(progress / templist.length * 100).toFixed(1)}%`);
        }
    }, parallelBasicReads);

    updateLine(`Found dates for ${count} images in ${calcTimeSpent(startTimestamp)}\n`);
    return templist;
}

async function indexTxtFiles(templist: ServerImageFull[], txtmap: Map<string, string>): Promise<ServerImageFull[]> {
    const log = `Indexing ${txtmap.size} images from txt files...`;
    updateLine(log);

    const startTimestamp = Date.now();
    let progress = 0;
    let found = 0;
    const newlist: ServerImageFull[] = [];
    const fullImages: ServerImageFull[] = [];
    const serverImages: ServerImage[] = [];

    for (const image of templist) {
        progress++;

        backgroundTasks.addWork(async () => {
            const partial = removeExtension(image.file);
            if (!txtmap.has(partial)) {
                newlist.push(image);
                return;
            }

            const res = await readMetadataFromFile(image, txtmap.get(partial)!).catch(() => image);

            if (!res.prompt && !res.workflow) {
                newlist.push(res);
                return;
            }

            const processed = getServerImage(res);
            fullImages.push(res);
            serverImages.push(processed);
            imageList.set(res.id, processed);
            addUniqueImage(processed);
            found++;
        });

        if (progress % 1000 === 0 || progress >= templist.length) {
            await backgroundTasks.wait();
            MetaDB.setAll(fullImages);
            MetaCalcDB.setAll(serverImages);
            updateLine(log + ` ${(progress / templist.length * 100).toFixed(1)}%`);
        }
    }

    updateLine(`Found txt metadata for ${found} images in ${calcTimeSpent(startTimestamp)}\n`);
    return newlist;
}

async function indexExifFiles(templist: ServerImageFull[], videomap: Map<string, string>): Promise<void> {
    const log = `Indexing ${templist.length} images from exif...`;
    updateLine(log);

    const startTimestamp = Date.now();
    let progress = 0;
    let found = 0;
    const fullImages: ServerImageFull[] = [];
    const serverImages: ServerImage[] = [];

    for (const image of templist) {
        progress++;

        backgroundTasks.addWork(async () => {
            const partial = removeExtension(image.file);
            const source = videomap.get(partial);
            const res = await readMetadataFromExif(image, source).catch(() => image);

            const processed = getServerImage(res);
            fullImages.push(res);
            serverImages.push(processed);
            imageList.set(res.id, processed);
            addUniqueImage(processed);
            if (res.prompt || res.workflow)
                found++;
        });

        if (progress % 1000 === 0 || progress >= templist.length) {
            await backgroundTasks.wait();
            MetaDB.setAll(fullImages);
            MetaCalcDB.setAll(serverImages);
            updateLine(log + ` ${(progress / templist.length * 100).toFixed(1)}%`);
        }
    }

    updateLine(`Found exif metadata for ${found} images in ${calcTimeSpent(startTimestamp)}\n`);
}

async function readMetadataFromFile(image: ServerImageFull, file: string): Promise<ServerImageFull> {
    const text = await fs.readFile(file, 'utf8');
    image.prompt = text;
    return image;
}

async function readMetadataFromExif(image: ServerImageFull, altSource?: string): Promise<ServerImageFull> {
    const validSource = isMetadataFiletype(image.file) || isMetadataFiletype(altSource ?? "");
    if (!validSource)
        return image;
    const metadata = await exifr.parse(altSource || image.file, {
        ifd0: false,
        chunked: false,
    } as any);
    if (!metadata)
        return image;
    image.prompt = metadata.parameters ?? metadata.prompt ?? undefined;
    image.workflow = metadata.workflow ?? undefined;

    if (image.prompt === undefined && image.workflow === undefined) {
        image.prompt = JSON.stringify(metadata);
    }

    if (altSource)
        image.preview = altSource;
    return image;
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
    if (count)
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
    if (count)
        console.log(`Cleaned ${count} preview images`);
}

function cleanCalcDB() {
    const ids = MetaCalcDB.getAllIds();
    const deletions = ids.filter(x => !imageList.has(x));
    MetaCalcDB.deleteAll(deletions);
}

async function deleteTempImage(id: string) {
    const thumbfile = path.join(thumbnailPath, `${id}.webp`);
    const compfile = path.join(compressedPath, `${id}.webp`);
    await fs.unlink(thumbfile).catch(() => '');
    await fs.unlink(compfile).catch(() => '');
}

let indexTimer: any;

function setupWatcher() {
    const options: WatcherOptions = {
        recursive: true,
        ignoreInitial: true,
    };

    if (watcher) watcher.close();
    watcher = new Watcher(IMG_FOLDER, options);

    watcher.on('add', async file => {
        addFile(file);
    });

    watcher.on('rename', async (from, to) => {
        renameFile(from, to);
    });

    watcher.on('unlink', async file => {
        deleteFile(file);
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
                removeUniqueImage(value);
                imageList.delete(key);
                deleteTempImage(key);
            }
        }
    });

    if (pollingInterval > 0) {
        console.log(`Polling enabled with interval of ${pollingInterval / 1000} seconds`);
        pollFiles();
    }
    console.log('Listening to file changes...');
}

let genCount = 0;
const genLimit = 10;

async function addFile(file: string, hash?: string) {
    if (!isMedia(file)) return;
    if (!hash)
        hash = hashPath(file);

    if (file.endsWith('.png')) {
        const video = videoExists(file);
        if (video) {
            updateImageMetadata(video, file);
            return;
        }
        await sleep(100);
        if (await videoExistsOnDisk(file)) {
            console.log(`Skipping image since a video for it exists: ${file}`);
            return;
        }
    }

    try {
        if (genCount < genLimit) {
            genCount++;
            await generateCompressedFromId(hash, file);
            await generateThumbnailFromId(hash, file);
            genCount--;
        }
    } catch (e) {
        console.log(`Failed to generate preview for ${path.basename(file)} (this shouldn't appear)`);
        console.error(e);
    }

    if (isVideo(file)) {
        let size = 0;
        let newsize = (await fs.stat(file)).size;
        while (size != newsize) {
            await sleep(500);
            size = newsize;
            newsize = (await fs.stat(file)).size;
        }
        const image = videoPreviewExists(file);
        if (image)
            deleteFile(image.file);
    }

    console.log(`Added ${file}`);
    const image = await readMetadata({
        id: hash,
        folder: path.basename(path.dirname(file)),
        file,
        modifiedDate: 0,
        createdDate: 0,
        preview: "",
        prompt: "",
        workflow: "",
    });

    imageList.set(hash, getServerImage(image));

    const amount = freshList.unshift({
        id: hash,
        timestamp: Date.now(),
    });
    if (amount > freshLimit) freshList.pop();

    addUniqueImage(imageList.get(hash)!);
}

async function updateImageMetadata(image: ServerImage, source: string) {
    const newFull = await readMetadata({
        id: image.id,
        file: image.file,
        folder: image.folder,
        createdDate: image.createdDate,
        modifiedDate: image.modifiedDate,
        preview: image.preview,
        prompt: '',
        workflow: '',
    }, source);
    image.preview = source;
    const newImage = getServerImage(newFull);
    removeUniqueImage(image);
    addUniqueImage(newImage);
}

function videoExists(imagefile: string): ServerImage | undefined {
    const partial = removeExtension(imagefile);
    for (const filetype of videoFiletypes) {
        const hash = hashPath(`${partial}.${filetype}`);
        if (imageList.has(hash)) {
            return imageList.get(hash);
        }
    }
    return undefined;
}

async function videoExistsOnDisk(imagefile: string): Promise<string | undefined> {
    const partial = removeExtension(imagefile);
    for (const filetype of videoFiletypes) {
        const file = `${partial}.${filetype}`;
        if (await fileExists(file)) {
            return file;
        }
    }
    return undefined;
}

function videoPreviewExists(videofile: string): ServerImage | undefined {
    const partial = removeExtension(videofile);
    const hash = hashPath(`${partial}.png`);
    if (imageList.has(hash)) {
        return imageList.get(hash);
    }
    return undefined;
}

async function deleteFile(file: string) {
    if (!isMedia(file)) return;
    const hash = hashPath(file);
    removeUniqueImage(imageList.get(hash));
    imageList.delete(hash);
    freshList = freshList.filter(x => x.id !== hash);
    const size = deletionList.unshift({
        id: hash,
        timestamp: Date.now(),
    });
    if (size > freshLimit) deletionList.pop();
    deleteTempImage(hash);
}

async function renameFile(from: string, to: string) {
    if (isMedia(from)) {
        const oldhash = hashPath(from);
        removeUniqueImage(imageList.get(oldhash));
        imageList.delete(oldhash);
        deleteTempImage(oldhash);
    }

    if (!isMedia(to)) return;
    console.log(`Renamed ${from} to ${to}`);

    const newhash = hashPath(to);
    const image = await readMetadata({
        id: newhash,
        folder: path.basename(path.dirname(to)),
        file: to,
        modifiedDate: 0,
        createdDate: 0,
        preview: '',
        prompt: '',
        workflow: '',
    });

    imageList.set(newhash, getServerImage(image));
    addUniqueImage(imageList.get(newhash)!);
}

async function pollFiles() {
    await checkFiles();
    setTimeout(() => {
        pollFiles();
    }, pollingInterval);
}

async function checkFiles() {
    const dirs: string[] = [IMG_FOLDER];
    const images = new Set([...imageList.keys()]);

    while (dirs.length > 0) {
        const dir = dirs.pop();
        if (!dir) continue;
        const files = await fs.readdir(dir);

        for (const file of files.filter(x => isMedia(x))) {
            const fullpath = path.join(dir, file);
            const hash = hashPath(fullpath);
            if (imageList.has(hash)) {
                images.delete(hash);
                continue;
            }

            addFile(fullpath, hash);
        }

        for (const file of files.filter(x => !isMedia(x) && !isTxt(x))) {
            const fullpath = path.join(dir, file);
            try {
                const stats = await fs.stat(fullpath);
                if (stats.isDirectory()) dirs.push(fullpath);
            } catch {
                // failed
            }
        }
    }

    for (const id of images) {
        deleteFile(imageList.get(id)!.file);
    }
}

export function getImage(imageid: string) {
    const image = imageList.get(imageid);
    return image;
}

export function buildImageInfo(imageid: string): ImageInfo | undefined {
    const image = imageList.get(imageid);
    if (!image)
        return undefined;
    const full = MetaDB.get(imageid);
    return {
        id: image.id,
        createdDate: image.createdDate,
        modifiedDate: image.modifiedDate,
        folder: image.folder,
        positive: image.positive,
        negative: image.negative,
        params: image.params,
        prompt: full?.prompt,
        workflow: full?.workflow,
    };
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
        list = list.filter(x => isUnique(x.id));
    }

    return list;
}

export function simplifyPrompt(image: ServerImage | undefined): string {
    if (!image)
        return '';
    return `${image.positive}\n${image.negative}\n` + image.params
        .replace(/(, )?seed: \d+/i, '')
        .replace(/(, )?([^,]*)version: [^,]*/ig, '');
}

function isUnique(id: string) {
    return uniqueSet.has(id);
}

async function createUniqueListChunked() {
    uniqueSet = new Set();
    uniqueReverse = new Map();

    const chunksize = 1000;
    const templist = [...imageList.values()];
    for (let i = 0; i < templist.length; i += chunksize) {
        const chunk = templist.slice(i, i + chunksize);
        for (const image of chunk) {
            if (!image.positive)
                continue;
            const prompt = simplifyPrompt(image);
            if (uniqueReverse.has(prompt)) {
                const ids = uniqueReverse.get(prompt)!;
                ids.unshift(image.id);
                uniqueReverse.set(prompt, ids);
            } else {
                uniqueReverse.set(prompt, [image.id]);
            }
        }
        await sleep(1);
    }

    for (const ids of [...uniqueReverse.values()]) {
        uniqueSet.add(ids[0]);
    }
}

function addUniqueImage(image: ServerImage) {
    const prompt = simplifyPrompt(image);
    const existing = uniqueReverse.get(prompt);
    if (existing) {
        uniqueSet.delete(existing[0]);
        existing.unshift(image.id);
        uniqueReverse.set(prompt, existing);
    } else {
        uniqueReverse.set(prompt, [image.id]);
    }
    uniqueSet.add(image.id);
}

let uniqueTimeout: NodeJS.Timeout | undefined;
function removeUniqueImage(image: ServerImage | undefined) {
    if (!image) return;
    const id = image.id;
    const prompt = simplifyPrompt(image);

    if (prompt) {
        uniqueSet.delete(id);
        if (!uniqueReverse.has(prompt))
            return;
        const ids = uniqueReverse.get(prompt)!.filter(x => x !== id);
        if (!ids.length) {
            uniqueReverse.delete(prompt);
        } else {
            uniqueReverse.set(prompt, ids);
            uniqueSet.add(ids[0]);
        }

        if (uniqueSet.size !== uniqueReverse.size) {
            printLine('uniqueSet and uniqueReverse are out of sync');
            clearTimeout(uniqueTimeout);
            uniqueTimeout = setTimeout(() => {
                print('Attempting to rebuild unique list...');
                createUniqueListChunked();
                updateLine('Unique list rebuilt');
            }, 5000);
        }
    }
}

const keywordRegex = `((${searchKeywords.join('|')}) )*`;
const removeRegex = new RegExp(`^${keywordRegex}`);
const notRegex = new RegExp(`^${keywordRegex}NOT `);
const allRegex = new RegExp(`^${keywordRegex}ALL `);
const negativeRegex = new RegExp(`^${keywordRegex}(NEGATIVE|NEG) `);
const folderRegex = new RegExp(`^${keywordRegex}(FOLDER|FD) `);
const paramRegex = new RegExp(`^${keywordRegex}(PARAMS|PR) `);
const dateRegex = new RegExp(`^${keywordRegex}(DATE|DT) `);
function buildMatcher(search: string, matching: SearchMode): (image: ServerImage) => boolean {
    let parts = search.split(' AND ');
    // reorder query for performance
    parts = parts.filter(x => dateRegex.test(x))
        .concat(parts.filter(x => folderRegex.test(x)))
        .concat(parts.filter(x => !dateRegex.test(x) && !folderRegex.test(x)));

    const regexes = parts.map(x => {
        const raw = x.replace(removeRegex, '');

        let type: MatchType = 'positive';
        if (allRegex.test(x)) type = 'all';
        else if (negativeRegex.test(x)) type = 'negative';
        else if (folderRegex.test(x)) type = 'folder';
        else if (paramRegex.test(x)) type = 'params';
        else if (dateRegex.test(x)) type = 'date';

        return {
            raw,
            regex: new RegExp(raw, 'is'),
            not: x.match(notRegex),
            type,
        };
    });

    return (image: ServerImage) => {
        return regexes.every(x => {
            if (x.type === 'date') {
                if (x.raw.toLowerCase().startsWith('to ')) {
                    const end = unixTime(x.raw.substring(3));
                    return image.modifiedDate <= end;
                } else {
                    const dates = x.raw.toLowerCase().split(' to ');
                    const start = unixTime(dates[0]);
                    const end = dates[1] ? unixTime(dates[1]) : undefined;
                    return image.modifiedDate >= start && (end === undefined || image.modifiedDate <= end);
                }
            }

            const text = getTextByType(image, x.type);

            if (matching === 'contains') {
                return XOR(x.not, text.toLowerCase().includes(x.raw.toLowerCase()));
            } else if (matching === 'words') {
                const words = x.raw.split(' ');
                return XOR(x.not, words.every(word => new RegExp(`\\b${word}\\b`, 'i').test(text)));
            } else {
                return XOR(x.not, x.regex.test(text));
            }
        });
    };
}

function getTextByType(image: ServerImage, type: MatchType): string {
    if (!image) return '';

    switch (type) {
        case 'folder':
            return image.folder;
        case 'date':
            return String(image.modifiedDate);
        case 'positive':
            return image.positive;
        case 'negative':
            return image.negative;
        case 'params':
            return image.params;
        case 'all':
            return getFullMetaForImage(image.id);
    }
}

function getFullMetaForImage(id: string): string {
    const image = MetaDB.get(id);
    return `${image?.prompt}\n${image?.workflow}\n${image?.folder}`;
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

export function hashPath(filepath: string) {
    const hash = crypto.createHash('sha256');
    hash.update(removeBasePath(filepath));
    return hash.digest('hex');
}

function removeBasePath(filepath: string) {
    filepath = filepath.replace(/(\/|\\)+$/, '');
    return filepath.replace(IMG_FOLDER, '');
}

function removeFolderFromPath(file: string) {
    return file.match(/[^/\\]+(\/|\\)?$/)?.[0].replace(/(\/|\\)$/, '');
}

async function readMetadata(image: ServerImageFull, source?: string): Promise<ServerImageFull> {
    try {
        const stats = await fs.stat(image.file);
        image.modifiedDate = stats.mtimeMs;
        image.createdDate = stats.birthtimeMs;

        if (source) {
            return await readMetadataFromExif(image, source).catch(() => image);
        }

        if (isVideo(image.file)) {
            const candidate = image.file.replace(/\.\w+$/i, '.png');
            if (await fileExists(candidate)) {
                return await readMetadataFromExif(image, candidate).catch(() => image);
            }

            return image;
        }

        const filetypes = ['.txt', '.yaml', '.yml', '.json'];
        for (const filetype of filetypes) {
            const candidate = image.file.replace(/\.\w+$/i, filetype);
            if (await fileExists(candidate)) {
                const text = await fs.readFile(candidate, 'utf8');
                image.prompt = text;
                return image;
            }
        }

        return readMetadataFromExif(image);
    } catch {
        console.log(`Failed to read metadata for ${image.file}`);
        return image;
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

export async function moveImages(ids: string | string[], folder: string) {
    if (typeof ids === 'string') ids = [ids];

    const targetFolder = path.join(IMG_FOLDER, folder.replace(/^\/?/, ''));

    let failcount = 0;
    for (const id of ids) {
        const img = imageList.get(id);
        if (!img)
            continue;
        let newPath = path.join(targetFolder, removeFolderFromPath(img.file)!);
        if (img.file === newPath)
            continue;
        newPath = await fileUniquefy(newPath);

        try {
            await fs.rename(img.file, newPath);
            removeUniqueImage(img);
            imageList.delete(id);
            deleteTextFiles(img.file);
            deleteTempImage(id);
        } catch {
            failcount++;
            continue;
        }

        if (img.preview) {
            try {
                const newPreview = `${splitExtension(newPath)[0]}.png`;
                fs.rename(img.preview, newPreview);
                deleteTempImage(hashPath(img.preview));
            } catch {
                console.log(`Failed to move preview file ${img.preview}`);
            }
        }
    }

    if (failcount) {
        console.log(`Failed to move ${failcount} images`);
    }
}

export async function copyImages(ids: string | string[], folder: string) {
    if (typeof ids === 'string') ids = [ids];

    const targetFolder = path.join(IMG_FOLDER, folder.replace(/^\/?/, ''));

    let failcount = 0;
    for (const id of ids) {
        const img = imageList.get(id);
        if (!img)
            continue;
        let newPath = path.join(targetFolder, removeFolderFromPath(img.file)!);
        if (img.file === newPath)
            continue;
        newPath = await fileUniquefy(newPath);

        try {
            await fs.copyFile(img.file, newPath);
        } catch {
            failcount++;
            continue;
        }

        if (img.preview) {
            try {
                const newPreview = `${splitExtension(newPath)[0]}.png`;
                fs.copyFile(img.preview, newPreview);
            } catch {
                console.log(`Failed to copy preview file ${img.preview}`);
            }
        }
    }

    if (failcount) {
        console.log(`Failed to copy ${failcount} images`);
    }
}

export async function deleteImages(ids: string | string[]) {
    if (typeof ids === 'string') ids = [ids];

    let failcount = 0;
    for (const id of ids) {
        const img = imageList.get(id);
        if (!img) continue;

        try {
            await fs.unlink(img.file);
            removeUniqueImage(img);
            imageList.delete(id);
            deleteTextFiles(img.file);
            deleteTempImage(id);
        } catch {
            failcount++;
        }

        if (img.preview) {
            try {
                fs.unlink(img.preview);
                deleteTempImage(hashPath(img.preview));
            } catch {
                console.log(`Failed to delete preview file ${img.preview}`);
            }
        }
    }

    if (failcount)
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
