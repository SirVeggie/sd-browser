import { IMG_FOLDER } from '$env/static/private';
import { env } from '$env/dynamic/private';
import path from 'path';
import os from 'os';
import cp from 'child_process';
import fs from 'fs/promises';
import Watcher from 'watcher';
import type { WatcherOptions } from 'watcher/dist/types';
import { calcTimeSpent, isImage, isMedia, isTxt, isVideo, limitedParallelMap, print, printLine, removeExtension, updateLine, videoFiletypes, lazy, calcProgress, calcTimeRemaining } from '$lib/tools/misc';
import { generateCompressedFromId, generateThumbnailFromId } from './convert';
import { sleep } from '$lib/tools/sleep';
import { backgroundTasks } from './background';
import { MetaCalcDB, MetaDB } from './db';
import type { ImageExtraData, ImageList, ServerImage, ServerImageFull, TimedImage } from '$lib/types/images';
import { deleteTempImage, fileExists, fileUniquefy, removeBasePath, removeFolderFromPath, splitExtension } from './filetools';
import { handleLegacyEnd, handleLegacyStart } from './legacy';
import { getServerImage, hashPath, hashPrompt, populateServerImage, readMetadata, readMetadataFromExif, readMetadataFromFile, updateImageMetadata } from './imageUtils';

const pollingInterval = Number(env.POLLING_SECONDS ?? 0) * 1000;

let watcher: Watcher | undefined;
let imageList: ImageList = new Map();
let freshList: TimedImage[] = [];
let uniqueSet: Set<string> = new Set();
let uniqueReverse: Map<string, string> = new Map();
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

//#region indexing
export async function startFileManager() {
    await handleLegacyStart();
    await indexFiles();
}

export async function indexFiles() {
    console.log(`Indexing files in ${IMG_FOLDER}`);
    const startTimestamp = Date.now();

    fs.mkdir(datapath).catch(() => '');
    fs.mkdir(thumbnailPath).catch(() => '');
    fs.mkdir(compressedPath).catch(() => '');

    // read cached data
    // eslint-disable-next-line prefer-const
    let [templist, txtmap, videomap] = await indexCachedFiles();

    // initialize existing cache
    if (imageList.size) {
        print(`Building unique list for ${imageList.size} images...`);
        await createUniqueListChunked();
        updateLine(`Unique list created with ${uniqueSet.size} items\n`);
    }
    
    // start watcher early
    setupWatcher();

    // read modified and created dates
    if (templist.length !== 0) {
        templist = await indexBasicFileData(templist);
    }

    if (templist.length !== 0) {
        // sort
        print('Sorting remaining images by modified date...');
        templist.sort((a, b) => b.modifiedDate - a.modifiedDate);
        generationDisabled = true;

        // read metadata from txt files
        templist = await indexTxtFiles(templist, txtmap);
    }

    // read metadata from exif
    if (templist.length !== 0) {
        const originalLimit = backgroundTasks.limit;
        backgroundTasks.limit = 5;
        await indexExifFiles(templist, videomap);
        backgroundTasks.limit = originalLimit;
    }

    generationDisabled = false;

    // finish up
    console.log(`Indexed ${imageList.size} images in ${calcTimeSpent(startTimestamp)}`);
    await handleLegacyEnd();
    cleanTempImages();
    console.log(`Found ${lazy(imageList.values()).filter(x => !!x.positive).count()} images with metadata`);
    console.log('\nIndexing complete, yay!\n');
}

async function indexCachedFiles(): Promise<[ServerImageFull[], Map<string, string>, Map<string, string>]> {
    const templist: ServerImageFull[] = [];
    const images: ImageList = new Map();
    const dirs: string[] = [IMG_FOLDER];
    const set = new Set<string>();
    const videomap: Map<string, string> = new Map();
    const txtmap: Map<string, string> = new Map();
    const checkSet = new Set<string>();
    const dbCount = MetaDB.count();
    let found = 0;
    let foundtxt = 0;
    let foundtxtnew = 0;

    if (!imageList.size)
        imageList = images;
    if (dbCount) {
        // const batchSize = 1000;
        print('Loading cache from DB...');
        for (const image of MetaDB.getAllShort()) {
            images.set(image.id, image);
            checkSet.add(image.id);
        }

        updateLine('Loading extras from DB...');
        const deleted = [];
        for (const data of MetaCalcDB.getAll()) {
            if (!images.has(data.id)) {
                deleted.push(data.id);
                continue;
            }

            populateServerImage(images.get(data.id)!, data);
        }

        updateLine('Deleting obsolete data...');
        MetaCalcDB.deleteAll(deleted);

        updateLine('Verifying cache...');
        const missing = lazy(images.values()).filter(x => x.positive === undefined).collect();
        const missingAmount = missing.length;

        // wait for server to start
        if (missing.length) {
            updateLine('');
            await sleep(100);
        }

        const start = Date.now();
        let remaining = '?';
        while (missing.length) {
            const extraData: ImageExtraData[] = [];
            const fulls = MetaDB.getMany(missing.splice(0, 1000).map(x => x.id));
            updateLine(`Calculating missing data: ${(missingAmount - missing.length)} / ${missingAmount} (processing) | estimate: ${remaining}`);
            for (const full of fulls) {
                const processed = getServerImage(full);
                images.set(full.id, processed);
                extraData.push(processed);
            }
            remaining = calcTimeRemaining(start, missingAmount - missing.length, missingAmount);
            updateLine(`Calculating missing data: ${(missingAmount - missing.length)} / ${missingAmount} (loading)    | estimate: ${remaining}`);
            MetaCalcDB.setAll(extraData);
            await sleep(10);
        }
        updateLine('');
    } else {
        MetaCalcDB.clearAll();
    }

    await sleep(100);

    if (!images.size) {
        console.log('No cache file, or failed to read it');
        console.log('Building index from scratch');
    } else {
        console.log(`Retrieved ${images.size} images from cache`);
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

            if (images.has(hash)) {
                images.get(hash)!.file = fullpath;
                checkSet.delete(hash);
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
                found--;
                videomap.set(partial, fullpath);
                continue;
            }

            if (images.has(hash)) {
                images.get(hash)!.file = fullpath;
                checkSet.delete(hash);
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

        updateLine(`Searching ${found} images${(foundtxt ? ` and ${foundtxt} txt files` : '')}`);
    }

    imageList = images;
    updateLine(`Found ${found - images.size} new images${(foundtxt ? ` and ${foundtxtnew} txt files` : '')}\n`);
    deleteMissingImages(checkSet);
    return [templist, txtmap, videomap];
}

function deleteMissingImages(set: Set<string>) {
    const deletions = [...set.values()];
    MetaDB.deleteAll(deletions);
    MetaCalcDB.deleteAll(deletions);
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
    const log = `Indexing ${txtmap.size} images from txt files`;
    updateLine(`${log}...`);

    const tStart = Date.now();
    const total = templist.length;
    const newlist: ServerImageFull[] = [];
    let progress = 0;
    let found = 0;

    while (templist.length) {
        const fullImages: ServerImageFull[] = [];
        const extraData: ImageExtraData[] = [];
        const batch = templist.splice(0, 1000);
        progress += batch.length;

        for (const image of batch) {
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
                extraData.push(processed);
                imageList.set(res.id, processed);
                addUniqueImage(processed);
                found++;
            });
        }

        await backgroundTasks.wait();
        MetaDB.setAll(fullImages);
        MetaCalcDB.setAll(extraData);
        updateLine(log + `: ${calcProgress(progress, total)}% | estimate: ${calcTimeRemaining(tStart, progress, total)}`);
    }

    updateLine(`Found txt metadata for ${found} images in ${calcTimeSpent(tStart)}\n`);
    return newlist;
}

async function indexExifFiles(templist: ServerImageFull[], videomap: Map<string, string>): Promise<void> {
    const log = `Indexing ${templist.length} images from exif`;
    updateLine(`${log}...`);

    const tStart = Date.now();
    const total = templist.length;
    let progress = 0;
    let found = 0;

    while (templist.length) {
        const fullImages: ServerImageFull[] = [];
        const extraData: ImageExtraData[] = [];
        const batch = templist.splice(0, 1000);
        progress += batch.length;

        for (const image of batch) {
            backgroundTasks.addWork(async () => {
                const partial = removeExtension(image.file);
                const source = videomap.get(partial);
                const res = await readMetadataFromExif(image, source).catch(() => image);
                const processed = getServerImage(res);

                fullImages.push(res);
                extraData.push(processed);
                imageList.set(res.id, processed);
                addUniqueImage(processed);
                if (res.prompt || res.workflow)
                    found++;
            });
        }

        await backgroundTasks.wait();
        MetaDB.setAll(fullImages);
        MetaCalcDB.setAll(extraData);
        updateLine(log + `: ${calcProgress(progress, total)}% | estimate: ${calcTimeRemaining(tStart, progress, total)}`);
    }

    updateLine(`Found exif metadata for ${found} images in ${calcTimeSpent(tStart)}\n`);
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
//#endregion

//#region file watcher
let indexTimer: any;
let isWatching = false;

function setupWatcher() {
    if (isWatching)
        return;
    isWatching = true;
    
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
        const deletions: string[] = [];
        for (const [key, value] of imageList) {
            if (value.file.startsWith(dir)) {
                removeUniqueImage(value);
                imageList.delete(key);
                deleteTempImage(key);
                deletions.push(key);
            }
        }
        
        MetaDB.deleteAll(deletions);
        MetaCalcDB.deleteAll(deletions);
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
    const full = await readMetadata({
        id: hash,
        folder: path.basename(path.dirname(file)),
        file,
        modifiedDate: 0,
        createdDate: 0,
        preview: "",
        prompt: "",
        workflow: "",
    });

    const image = getServerImage(full);
    imageList.set(hash, image);
    addUniqueImage(image);
    
    const amount = freshList.unshift({
        id: hash,
        timestamp: Date.now(),
    });
    if (amount > freshLimit) freshList.pop();
    
    MetaDB.set(full);
    MetaCalcDB.set(image);
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
    
    MetaDB.delete(hash);
    MetaCalcDB.delete(hash);
}

async function renameFile(from: string, to: string) {
    if (isMedia(from)) {
        const oldhash = hashPath(from);
        removeUniqueImage(imageList.get(oldhash));
        imageList.delete(oldhash);
        deleteTempImage(oldhash);
        
        MetaDB.delete(oldhash);
        MetaCalcDB.delete(oldhash);
    }

    if (!isMedia(to)) return;
    console.log(`Renamed ${from} to ${to}`);

    const newhash = hashPath(to);
    const full = await readMetadata({
        id: newhash,
        folder: path.basename(path.dirname(to)),
        file: to,
        modifiedDate: 0,
        createdDate: 0,
        preview: '',
        prompt: '',
        workflow: '',
    });

    const image = getServerImage(full);
    imageList.set(newhash, image);
    addUniqueImage(image);
    
    MetaDB.set(full);
    MetaCalcDB.set(image);
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
//#endregion

//#region unique images
async function createUniqueListChunked(rebuild = false) {
    uniqueSet = new Set();
    uniqueReverse = new Map();

    if (!rebuild) {
        // add known uniques
        lazy(imageList.values()).filter(x => x.isUnique === 1).forEach(x => {
            uniqueSet.add(x.id);
            uniqueReverse.set(x.hash, x.id);
        });

        // handle unknowns
        const missing = lazy(imageList.values()).filter(x => x.isUnique === -1).map(x => x.id).collect();
        const total = missing.length;
        const start = Date.now();
        const batch = 1000;
        let progress = 0;

        while (missing.length) {
            for (const id of missing.splice(0, batch)) {
                const image = imageList.get(id)!;
                addUniqueImage(image);
            }
            progress += batch;
            updateLine(`Building unique list: ${progress}/${total} | estimate: ${calcTimeRemaining(start, progress, total)}`);
            await sleep(10);
        }
        setTimeout(() => {
            MetaCalcDB.clearUniques(true);
        }, 1000);
        return;
    }

    const chunksize = 1000;
    const templist = [...imageList.values()];
    for (let i = 0; i < templist.length; i += chunksize) {
        const chunk = templist.slice(i, i + chunksize);
        for (const image of chunk) {
            if (!image.positive)
                continue;
            hashPrompt(image);
            if (!uniqueReverse.has(image.hash)) {
                uniqueReverse.set(image.hash, image.id);
            }
        }
        await sleep(10);
    }

    for (const ids of [...uniqueReverse.values()]) {
        uniqueSet.add(ids[0]);
    }

    MetaCalcDB.clearUniques(false);
    MetaCalcDB.setAllUnique([...uniqueSet.keys()], true);
}

let uniqueSaveTimeout: NodeJS.Timeout | undefined;
const unqiueAdds: string[] = [];
const uniqueRems: string[] = [];
/**
 * Mark image as unique. Image with the latest modifiedDate is marked if duplicate.
 * TODO: causes repeated DB access which is probably inefficient
 */
export function addUniqueImage(image: ServerImage) {
    hashPrompt(image);
    if (!image.hash)
        return;
    const old = imageList.get(uniqueReverse.get(image.hash) ?? '');
    if (old) {
        if (image.modifiedDate < old.modifiedDate)
            return;
        uniqueSet.delete(old.id);
        old.isUnique = 0;
        uniqueRems.push(old.id);
    }
    uniqueReverse.set(image.hash, image.id);
    uniqueSet.add(image.id);
    unqiueAdds.push(image.id);

    // defer db access for bulk updates
    clearTimeout(uniqueSaveTimeout);
    setTimeout(() => {
        MetaCalcDB.setAllUnique(unqiueAdds, true);
        MetaCalcDB.setAllUnique(uniqueRems, false);
        uniqueRems.length = 0;
        unqiueAdds.length = 0;
    }, 1000);
}

let uniqueTimeout: NodeJS.Timeout | undefined;
export function removeUniqueImage(image: ServerImage | undefined) {
    if (!image)
        return;
    hashPrompt(image);
    if (image.hash) {
        if (uniqueSet.has(image.id)) {
            uniqueSet.delete(image.id);
            uniqueReverse.delete(image.hash);
            MetaCalcDB.setUnique(image.id, false);
            const ids = MetaCalcDB.getIdsByHash(image.hash);
            const id = ids.map(x => ({ id: x, date: imageList.get(x)!.modifiedDate })).sort((a, b) => b.date - a.date)[0].id;
            uniqueSet.add(id);
            uniqueReverse.set(image.hash, id);
            MetaCalcDB.setUnique(id, true);
        }

        if (uniqueSet.size !== uniqueReverse.size) {
            printLine('uniqueSet and uniqueReverse are out of sync');
            clearTimeout(uniqueTimeout);
            uniqueTimeout = setTimeout(() => {
                print('Attempting to rebuild unique list...');
                createUniqueListChunked(true);
                updateLine('Unique list rebuilt');
            }, 5000);
        }
    }
}
//#endregion

export function getImage(imageid: string) {
    const image = imageList.get(imageid);
    return image;
}

export function getImageList() {
    return imageList;
}

export function isUnique(id: string) {
    return uniqueSet.has(id);
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

//#region actions
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
//#endregion
