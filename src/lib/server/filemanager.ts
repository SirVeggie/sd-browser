import { env } from '$env/dynamic/private';
import { ensurePathsExist, imgFolder, qualityTierPaths } from './paths';
import path from 'path';
import os from 'os';
import cp from 'child_process';
import fs from 'fs/promises';
import Watcher from 'watcher';
import type { WatcherOptions } from 'watcher/dist/types';
import { calcTimeSpent, isImage, isMedia, isTxt, isVideo, limitedParallelMap, print, removeExtension, updateLine, videoFiletypes, lazy, calcProgress, calcTimeRemaining } from '$lib/tools/misc';
// import { generateCompressedFromId, generateThumbnailFromId } from './convert';
import { sleep } from '$lib/tools/sleep';
import { backgroundTasks } from './background';
import { MetaCalcDB, MetaDB } from './db';
import { EmbeddingDB } from './embeddingDb';
import type { ImageExtraData, ImageList, ServerImage, ServerImageFull } from '$lib/types/images';
import { deleteTempImage, fileExists, fileUniquefy, folderFromDir, folderFromFile, removeBasePath, removeFolderFromPath, splitExtension } from './filetools';
import { handleMigrationEnd, handleMigrationStart } from './migration';
import { backfillImageDimensions } from './migration/v3';
import { getServerImage, hashPath, populateServerImage, readMetadata, readMetadataFromExif, readMetadataFromFile, updateImageMetadata } from './imageUtils';
import { forEachExtradataBatch } from './extradataBatch';
import { populateMediaDimensions } from './imageDimensions';
import { invalidateExplorationPools, repairExplorationCaches, repairUniqueCacheAfterDeletes, repairUniqueCacheOnAdd, verifyExplorationCaches } from './exploration';
import { notifyImageChange } from './imageChangeHub';
import { ensureDefaultTagsRegistry } from './tags';
import {
    getImageList,
    recordDeletion,
    recordFreshImage,
    removeFreshImage,
    replaceImageList,
    setGenerationDisabled,
} from './dataIndex';

const pollingInterval = Number(env.POLLING_SECONDS ?? 0) * 1000;

let watcher: Watcher | undefined;

//#region indexing
export async function startFileManager() {
    ensurePathsExist();
    await handleMigrationStart();
    ensureDefaultTagsRegistry();
    await indexFiles();
}

export async function indexFiles() {
    console.log(`Indexing files in ${imgFolder}`);
    const startTimestamp = Date.now();

    if (MetaDB.countMissingDimensions()) {
        await backfillImageDimensions();
    }

    // read cached data
    // eslint-disable-next-line prefer-const
    let [templist, txtmap, videomap] = await indexCachedFiles();

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
        setGenerationDisabled(true);

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

    setGenerationDisabled(false);

    // finish up
    const imageList = getImageList();
    console.log(`Indexed ${imageList.size} images in ${calcTimeSpent(startTimestamp)}`);
    handleMigrationEnd();
    cleanTempImages();
    verifyExplorationCaches([...imageList.values()]);
    console.log(`Found ${lazy(imageList.values()).filter(x => !!x.positive).count()} images with metadata`);
    console.log('\nIndexing complete, yay!\n');
}

async function indexCachedFiles(): Promise<[ServerImageFull[], Map<string, string>, Map<string, string>]> {
    const templist: ServerImageFull[] = [];
    const images: ImageList = new Map();
    const dirs: string[] = [imgFolder];
    const set = new Set<string>();
    const videomap: Map<string, string> = new Map();
    const txtmap: Map<string, string> = new Map();
    const checkSet = new Set<string>();
    const dbCount = MetaDB.count();
    let found = 0;
    let foundtxt = 0;
    let foundtxtnew = 0;

    if (!getImageList().size)
        replaceImageList(images);
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
        EmbeddingDB.deleteAll(deleted);

        updateLine('Verifying cache...');
        const missing = lazy(images.values()).filter(x => x.positive === undefined).collect();
        const missingAmount = missing.length;

        if (missingAmount) {
            const missingIds = missing.map(x => x.id);
            await forEachExtradataBatch(missingIds, {
                label: 'Calculating missing data',
                onBatch: async (extraData) => {
                    for (const item of extraData)
                        populateServerImage(images.get(item.id)!, item);
                    MetaCalcDB.setAll(extraData);
                },
            });
        }
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
        const dirShort = folderFromDir(dir);
        const files = await fs.readdir(dir);

        for (const file of files.filter(x => isVideo(x))) {
            found++;
            const fullpath = path.join(dir, file);
            const partial = removeExtension(fullpath);
            const hash = hashPath(fullpath);

            videomap.set(partial, "");

            if (images.has(hash)) {
                const image = images.get(hash)!;
                image.file = fullpath;
                image.folder = folderFromFile(fullpath);
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
                extra: '',
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
                const image = images.get(hash)!;
                image.file = fullpath;
                image.folder = folderFromFile(fullpath);
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
                extra: '',
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

    replaceImageList(images);
    updateLine(`Found ${found - images.size} new images${(foundtxt ? ` and ${foundtxtnew} txt files` : '')}\n`);

    const folderRepairs: ServerImageFull[] = [];
    for (const image of images.values()) {
        const folder = folderFromFile(image.file);
        if (image.folder === folder)
            continue;
        image.folder = folder;
        const full = MetaDB.get(image.id);
        if (full) {
            full.folder = folder;
            full.file = image.file;
            folderRepairs.push(full);
        }
    }
    if (folderRepairs.length) {
        MetaDB.setAll(folderRepairs);
        console.log(`Repaired folder path for ${folderRepairs.length} images`);
    }

    deleteMissingImages(checkSet);
    return [templist, txtmap, videomap];
}

function deleteMissingImages(set: Set<string>) {
    const deletions = [...set.values()];
    if (deletions.length)
        invalidateExplorationPools(`removed ${deletions.length} missing images during indexing`);
    MetaDB.deleteAll(deletions);
    MetaCalcDB.deleteAll(deletions);
    EmbeddingDB.deleteAll(deletions);
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
            await populateMediaDimensions(x);
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
                getImageList().set(res.id, processed);
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
                getImageList().set(res.id, processed);
                if (res.prompt || res.workflow || res.extra)
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
    let totalCount = 0;
    for (const [tier, tierPath] of Object.entries(qualityTierPaths)) {
        let count = 0;
        await fs.readdir(tierPath).then(files => {
            for (const file of files) {
                const id = path.basename(file, '.webp');
                if (!getImageList().has(id)) {
                    count++;
                    fs.unlink(path.join(tierPath, file)).catch(() => '');
                }
            }
        });
        if (count) {
            console.log(`Cleaned ${count} ${tier} cache files`);
            totalCount += count;
        }
    }
    if (totalCount)
        console.log(`Cleaned ${totalCount} generated cache files total`);
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
    watcher = new Watcher(imgFolder, options);

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
        const deletedImages: ServerImage[] = [];
        let oldestDeleted = Number.POSITIVE_INFINITY;
        for (const [key, value] of getImageList()) {
            if (value.file.startsWith(dir)) {
                oldestDeleted = Math.min(oldestDeleted, value.modifiedDate);
                deletedImages.push(value);
                getImageList().delete(key);
                deleteTempImage(key);
                deletions.push(key);
            }
        }
        
        if (deletions.length) {
            repairUniqueCacheAfterDeletes([...getImageList().values()], deletedImages);
            repairExplorationCaches([...getImageList().values()], oldestDeleted, `removed directory ${path.basename(dir)} with ${deletions.length} images`);
        }
        MetaDB.deleteAll(deletions);
        MetaCalcDB.deleteAll(deletions);
        EmbeddingDB.deleteAll(deletions);
    });

    if (pollingInterval > 0) {
        console.log(`Polling enabled with interval of ${pollingInterval / 1000} seconds`);
        pollFiles();
    }
    console.log('Listening to file changes...');
}

// let genCount = 0;
// const genLimit = 10;

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
        folder: folderFromFile(file),
        file,
        modifiedDate: 0,
        createdDate: 0,
        preview: "",
        prompt: "",
        workflow: "",
        extra: "",
    });

    const image = getServerImage(full);
    getImageList().set(hash, image);
    repairUniqueCacheOnAdd([...getImageList().values()], image);
    repairExplorationCaches([...getImageList().values()], image.modifiedDate, `added image ${path.basename(file)}`);

    recordFreshImage(hash);

    MetaDB.set(full);
    MetaCalcDB.set(image);

    notifyImageChange();

    // try {
    //     if (genCount < genLimit) {
    //         genCount++;
    //         await generateCompressedFromId(hash, file);
    //         await generateThumbnailFromId(hash, file);
    //         genCount--;
    //     }
    // } catch (e) {
    //     console.log(`Failed to generate preview for ${path.basename(file)} (this shouldn't appear)`);
    //     console.error(e);
    // }
}

function videoExists(imagefile: string): ServerImage | undefined {
    const partial = removeExtension(imagefile);
    for (const filetype of videoFiletypes) {
        const hash = hashPath(`${partial}.${filetype}`);
        if (getImageList().has(hash)) {
            return getImageList().get(hash);
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
    if (getImageList().has(hash)) {
        return getImageList().get(hash);
    }
    return undefined;
}

async function deleteFile(file: string) {
    if (!isMedia(file)) return;
    const hash = hashPath(file);
    const image = getImageList().get(hash);
    getImageList().delete(hash);
    if (image) {
        repairUniqueCacheAfterDeletes([...getImageList().values()], [image]);
        repairExplorationCaches([...getImageList().values()], image.modifiedDate, `deleted image ${path.basename(file)}`);
    }
    removeFreshImage(hash);
    recordDeletion(hash);
    deleteTempImage(hash);
    
    MetaDB.delete(hash);
    MetaCalcDB.delete(hash);
    EmbeddingDB.deleteImage(hash);

    notifyImageChange();
}

async function renameFile(from: string, to: string) {
    let affectedModifiedDate = Number.POSITIVE_INFINITY;
    let oldImage: ServerImage | undefined;
    let oldhash: string | undefined;
    if (isMedia(from)) {
        oldhash = hashPath(from);
        oldImage = getImageList().get(oldhash);
        if (oldImage)
            affectedModifiedDate = Math.min(affectedModifiedDate, oldImage.modifiedDate);
        getImageList().delete(oldhash);
        deleteTempImage(oldhash);
        
        MetaDB.delete(oldhash);
        MetaCalcDB.delete(oldhash);
        EmbeddingDB.deleteImage(oldhash);
        removeFreshImage(oldhash);
        recordDeletion(oldhash);
    }

    if (oldImage)
        repairUniqueCacheAfterDeletes([...getImageList().values()], [oldImage]);

    if (!isMedia(to)) {
        notifyImageChange();
        return;
    }
    console.log(`Renamed ${from} to ${to}`);

    const newhash = hashPath(to);
    const full = await readMetadata({
        id: newhash,
        folder: folderFromFile(to),
        file: to,
        modifiedDate: 0,
        createdDate: 0,
        preview: '',
        prompt: '',
        workflow: '',
        extra: '',
    });

    const image = getServerImage(full);
    getImageList().set(newhash, image);
    repairUniqueCacheOnAdd([...getImageList().values()], image);
    affectedModifiedDate = Math.min(affectedModifiedDate, image.modifiedDate);
    repairExplorationCaches([...getImageList().values()], affectedModifiedDate, `renamed image ${path.basename(from)} to ${path.basename(to)}`);

    recordFreshImage(newhash);

    MetaDB.set(full);
    MetaCalcDB.set(image);

    notifyImageChange();
}

async function pollFiles() {
    await checkFiles();
    setTimeout(() => {
        pollFiles();
    }, pollingInterval);
}

async function checkFiles() {
    const dirs: string[] = [imgFolder];
    const images = new Set([...getImageList().keys()]);

    while (dirs.length > 0) {
        const dir = dirs.pop();
        if (!dir) continue;
        const files = await fs.readdir(dir);

        for (const file of files.filter(x => isMedia(x))) {
            const fullpath = path.join(dir, file);
            const hash = hashPath(fullpath);
            if (getImageList().has(hash)) {
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
        deleteFile(getImageList().get(id)!.file);
    }
}
//#endregion

//#region actions
export async function moveImages(ids: string | string[], folder: string) {
    if (typeof ids === 'string') ids = [ids];

    const targetFolder = path.join(imgFolder, folder.replace(/^\/?/, ''));

    let failcount = 0;
    let moved = 0;
    let oldestMoved = Number.POSITIVE_INFINITY;
    for (const id of ids) {
        const img = getImageList().get(id);
        if (!img)
            continue;
        let newPath = path.join(targetFolder, removeFolderFromPath(img.file)!);
        if (img.file === newPath)
            continue;
        newPath = await fileUniquefy(newPath);

        try {
            await fs.rename(img.file, newPath);
            oldestMoved = Math.min(oldestMoved, img.modifiedDate);
            getImageList().delete(id);
            removeFreshImage(id);
            recordDeletion(id);
            deleteTextFiles(img.file);
            deleteTempImage(id);
            moved++;
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
    if (moved) {
        repairExplorationCaches([...getImageList().values()], oldestMoved, `moved ${moved} images`);
        notifyImageChange();
    }
}

export async function copyImages(ids: string | string[], folder: string) {
    if (typeof ids === 'string') ids = [ids];

    const targetFolder = path.join(imgFolder, folder.replace(/^\/?/, ''));

    let failcount = 0;
    for (const id of ids) {
        const img = getImageList().get(id);
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
    let deleted = 0;
    let oldestDeleted = Number.POSITIVE_INFINITY;
    const deletedImages: ServerImage[] = [];
    const deletedIds: string[] = [];
    for (const id of ids) {
        const img = getImageList().get(id);
        if (!img) continue;

        try {
            await fs.unlink(img.file);
            oldestDeleted = Math.min(oldestDeleted, img.modifiedDate);
            getImageList().delete(id);
            deleteTextFiles(img.file);
            deleteTempImage(id);
            deletedImages.push(img);
            deletedIds.push(id);
            deleted++;
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
    if (deletedImages.length)
        repairUniqueCacheAfterDeletes([...getImageList().values()], deletedImages);
    if (deleted)
        repairExplorationCaches([...getImageList().values()], oldestDeleted, `deleted ${deleted} images`);
    if (deletedIds.length)
        EmbeddingDB.deleteAll(deletedIds);
}

async function deleteTextFiles(imagepath: string) {
    const filetypes = ['.txt', '.yaml', '.yml', '.json'];
    for (const filetype of filetypes) {
        const textfile = imagepath.replace(/\.(png|jpg|jpeg|webp)$/i, filetype);
        fs.unlink(textfile).catch(() => '');
    }
}

export function openExplorer(id: string) {
    const filepath = getImageList().get(id)?.file;
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
