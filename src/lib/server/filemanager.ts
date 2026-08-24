import { env } from '$env/dynamic/private';
import { ensurePathsExist, getImageRoots, qualityTierPaths } from './paths';
import path from 'path';
import os from 'os';
import cp from 'child_process';
import fs from 'fs/promises';
import Watcher from 'watcher';
import type { WatcherOptions } from 'watcher/dist/types';
import { calcTimeSpent, isImage, isMedia, isTxt, isVideo, limitedParallelMap, print, removeExtension, updateLine, videoFiletypes, lazy, calcProgress, calcTimeRemaining } from '$lib/tools/misc';
import { sleep } from '$lib/tools/sleep';
import { MetaCalcDB, MetaDB } from './db';
import { EmbeddingDB } from './embeddingDb';
import type { ImageExtraData, ImageList, ServerImage, ServerImageFull } from '$lib/types/images';
import { deleteTempImage, fileExists, fileUniquefy, folderFromDir, folderFromFile, removeFolderFromPath, resolveImagePath, resolveTargetFolder, splitExtension } from './filetools';
import { handleMigrationEnd, handleMigrationStart } from './migration';
import { backfillImageDimensions } from './migration/v3';
import { getServerImage, hashPath, populateServerImage, readMetadata, updateImageMetadata } from './imageUtils';
import { forEachExtradataBatch } from './extradataBatch';
import { invalidateExplorationPools, repairExplorationCaches, repairUniqueCacheAfterDeletes, repairUniqueCacheOnAdd, verifyExplorationCaches } from './exploration';
import { notifyImageChange, notifyMetadataChange } from './imageChangeHub';
import { ensureDefaultTagsRegistry } from './tags';
import { ensureVideoPreview } from './videoPreview';
import { FILE_SETTLE_POLL_MS, isFileWriteLocked, waitUntilFileSettled } from './fileSettle';
import {
    getImageList,
    recordDeletion,
    recordFreshImage,
    removeFreshImage,
    replaceImageList,
    setGenerationDisabled,
} from './dataIndex';
import type { IndexingJob, IndexingResult } from './indexingComputeCore';
import { indexingWorkerPool } from './workers/indexingWorkerPool';

const pollingInterval = Number(env.POLLING_SECONDS ?? 0) * 1000;

let watchers: Watcher[] = [];

//#region indexing
export async function startFileManager() {
    ensurePathsExist();
    await handleMigrationStart();
    ensureDefaultTagsRegistry();
    await indexFiles();
}

let indexingRunning = false;
let indexingQueued = false;

/** Full filesystem reconcile + metadata index. Concurrent calls coalesce into one follow-up run. */
export async function indexFiles() {
    if (indexingRunning) {
        indexingQueued = true;
        return;
    }
    indexingRunning = true;
    try {
        do {
            indexingQueued = false;
            await runIndexFiles();
        } while (indexingQueued);
    } finally {
        indexingRunning = false;
    }
}

async function runIndexFiles() {
    const roots = getImageRoots();
    if (!roots.length) {
        console.warn('No IMG_FOLDER / IMG_FOLDERS configured — skipping indexing');
        setupWatcher();
        return;
    }

    console.log(`Indexing files in ${roots.map((r) => r.path).join('; ')}`);
    const startTimestamp = Date.now();

    if (MetaDB.countMissingDimensions()) {
        await backfillImageDimensions();
    }

    // eslint-disable-next-line prefer-const
    let [templist, txtmap, videomap] = await indexCachedFiles();

    setupWatcher();

    // Generate video companion PNGs before reading dimensions so width/height
    // come from the oriented preview (and dates still come from the mp4).
    if (templist.length !== 0) {
        await ensureVideoPreviews(templist, videomap);
        await indexNewImages(templist, txtmap, videomap);
    }

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
    const roots = getImageRoots();
    const dirs: string[] = roots.map((r) => r.path);
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
        let files: string[];
        try {
            files = await fs.readdir(dir);
        } catch {
            continue;
        }

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

const INDEX_FLUSH_SIZE = 500;
const INDEX_FLUSH_MS = 150;

/**
 * Stat for sort order, then process metadata+dimensions on the worker pool.
 * Flushes to SQLite / memory / SSE in coalesced batches (newest-first feed order).
 */
async function indexNewImages(
    templist: ServerImageFull[],
    txtmap: Map<string, string>,
    videomap: Map<string, string>,
): Promise<void> {
    const logDates = `Reading dates for ${templist.length} images...`;
    print(logDates);
    let dateProgress = 0;
    const dateStart = Date.now();

    await limitedParallelMap(templist, async (image) => {
        try {
            const stats = await fs.stat(image.file);
            image.modifiedDate = stats.mtimeMs;
            image.createdDate = stats.birthtimeMs;
        } catch {
            // leave dates at 0
        } finally {
            dateProgress++;
            if (dateProgress % 1000 === 0)
                updateLine(logDates + ` ${(dateProgress / templist.length * 100).toFixed(1)}%`);
        }
        return image;
    }, 20);

    updateLine(`Found dates for ${templist.length} images in ${calcTimeSpent(dateStart)}\n`);

    print('Sorting remaining images by modified date...');
    templist.sort((a, b) => b.modifiedDate - a.modifiedDate);
    setGenerationDisabled(true);

    const jobs: IndexingJob[] = templist.map((image) => {
        const partial = removeExtension(image.file);
        const txtPath = txtmap.get(partial);
        const exifSource = videomap.get(partial) || undefined;
        return {
            id: image.id,
            file: image.file,
            folder: image.folder,
            preview: image.preview || '',
            txtPath,
            exifSource: exifSource || undefined,
            preferTxt: Boolean(txtPath),
            width: image.width,
            height: image.height,
        };
    });

    const log = `Indexing ${jobs.length} images`;
    updateLine(`${log}...`);
    const tStart = Date.now();
    const total = jobs.length;
    let progress = 0;
    let found = 0;

    let buffer: IndexingResult[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let flushing = Promise.resolve();

    const flushBuffer = () => {
        flushing = flushing.then(async () => {
            const batch = buffer.splice(0, buffer.length);
            if (!batch.length)
                return;

            // Keep newest-first within each flush when workers finish out of order.
            batch.sort((a, b) => b.modifiedDate - a.modifiedDate);

            const fullImages: ServerImageFull[] = [];
            const extraData: ImageExtraData[] = [];
            const serverImages: ServerImage[] = [];
            const ids: string[] = [];

            for (const r of batch) {
                const full: ServerImageFull = {
                    id: r.id,
                    file: r.file,
                    folder: r.folder,
                    modifiedDate: r.modifiedDate,
                    createdDate: r.createdDate,
                    preview: r.preview,
                    prompt: r.prompt,
                    workflow: r.workflow,
                    extra: r.extra,
                    width: r.width,
                    height: r.height,
                };
                const processed: ServerImage = {
                    id: r.id,
                    file: r.file,
                    folder: r.folder,
                    modifiedDate: r.modifiedDate,
                    createdDate: r.createdDate,
                    preview: r.preview,
                    positive: r.positive,
                    negative: r.negative,
                    params: r.params,
                    models: r.models,
                    hash: r.hash,
                    annotation: '',
                    tags: [],
                    width: r.width,
                    height: r.height,
                };
                fullImages.push(full);
                extraData.push({
                    id: r.id,
                    positive: r.positive,
                    negative: r.negative,
                    params: r.params,
                    models: r.models,
                    hash: r.hash,
                    annotation: '',
                    tags: [],
                });
                serverImages.push(processed);
                ids.push(r.id);
                if (r.foundMetadata)
                    found++;
            }

            MetaDB.setAll(fullImages);
            MetaCalcDB.setAllNew(extraData);
            for (const img of serverImages)
                getImageList().set(img.id, img);
            notifyMetadataChange(ids);

            progress += batch.length;
            updateLine(log + `: ${calcProgress(progress, total)}% | estimate: ${calcTimeRemaining(tStart, progress, total)}`);
        });
        return flushing;
    };

    const scheduleFlush = () => {
        if (flushTimer)
            return;
        flushTimer = setTimeout(() => {
            flushTimer = undefined;
            void flushBuffer();
        }, INDEX_FLUSH_MS);
    };

    try {
        await indexingWorkerPool.processAll(jobs, async (results) => {
            buffer.push(...results);
            if (buffer.length >= INDEX_FLUSH_SIZE) {
                if (flushTimer) {
                    clearTimeout(flushTimer);
                    flushTimer = undefined;
                }
                await flushBuffer();
            } else {
                scheduleFlush();
            }
        });
    } finally {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = undefined;
        }
        await flushBuffer();
        setGenerationDisabled(false);
    }

    updateLine(`Indexed ${total} images (${found} with metadata) in ${calcTimeSpent(tStart)}\n`);
}

async function ensureVideoPreviews(templist: ServerImageFull[], videomap: Map<string, string>): Promise<void> {
    const videos = templist.filter(x => isVideo(x.file));
    if (!videos.length)
        return;

    const log = `Generating previews for ${videos.length} videos`;
    updateLine(`${log}...`);
    let done = 0;

    await limitedParallelMap(videos, async (image) => {
        const partial = removeExtension(image.file);
        let source = videomap.get(partial);
        if (!source) {
            source = (await ensureVideoPreview(image.file)) ?? '';
            if (source)
                videomap.set(partial, source);
        }
        if (source)
            image.preview = source;
        done++;
        if (done % 5 === 0 || done === videos.length)
            updateLine(`${log}: ${done}/${videos.length}`);
    }, 2);

    updateLine(`${log}: ${done}/${videos.length}\n`);
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
let indexTimer: ReturnType<typeof setTimeout> | undefined;
let isWatching = false;

function setupWatcher() {
    if (isWatching)
        return;
    isWatching = true;

    const options: WatcherOptions = {
        recursive: true,
        ignoreInitial: true,
    };

    for (const w of watchers)
        w.close();
    watchers = [];

    const roots = getImageRoots();
    if (!roots.length) {
        console.warn('No image roots to watch');
        return;
    }

    for (const root of roots) {
        const watcher = new Watcher(root.path, options);

        watcher.on('add', (file) => {
            void addFile(file).catch((err) => {
                console.error(`Failed to index added file ${file}`, err);
            });
        });

        watcher.on('change', (file) => {
            void addFile(file).catch((err) => {
                console.error(`Failed to index changed file ${file}`, err);
            });
        });

        watcher.on('rename', (from, to) => {
            void renameFile(from, to).catch((err) => {
                console.error(`Failed to handle rename ${from} -> ${to}`, err);
            });
        });

        watcher.on('unlink', (file) => {
            void deleteFile(file).catch((err) => {
                console.error(`Failed to handle unlink ${file}`, err);
            });
        });

        watcher.on('addDir', () => {
            clearTimeout(indexTimer);
            indexTimer = setTimeout(() => {
                void indexFiles().catch((err) => {
                    console.error('Failed to reindex after directory add', err);
                });
            }, 2000);
        });

        watcher.on('renameDir', () => {
            clearTimeout(indexTimer);
            indexTimer = setTimeout(() => {
                void indexFiles().catch((err) => {
                    console.error('Failed to reindex after directory rename', err);
                });
            }, 2000);
        });

        watcher.on('unlinkDir', (dir) => {
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

        watchers.push(watcher);
    }

    if (pollingInterval > 0) {
        console.log(`Polling enabled with interval of ${pollingInterval / 1000} seconds`);
        pollFiles();
    }
    console.log(`Listening to file changes in ${roots.length} root(s)...`);
}

const inflightAdds = new Map<string, Promise<void>>();
const VIDEO_PREVIEW_FAIL_STABLE_MS = 5_000;

async function addFile(file: string, hash?: string) {
    if (!isMedia(file)) return;
    const key = path.resolve(file);
    const existing = inflightAdds.get(key);
    if (existing)
        return existing;

    const work = addFileInner(file, hash).finally(() => {
        if (inflightAdds.get(key) === work)
            inflightAdds.delete(key);
    });
    inflightAdds.set(key, work);
    return work;
}

async function attachVideoPreview(image: ServerImage, videoFile: string): Promise<void> {
    if (!await waitUntilFileSettled(videoFile))
        return;
    const preview = await ensureVideoPreviewReady(videoFile);
    if (!preview)
        return;
    await updateImageMetadata(image, preview);
    notifyImageChange();
}

/** Retry first-frame extract until it works, or the file looks finished and still fails. */
async function ensureVideoPreviewReady(file: string): Promise<string | undefined> {
    let lastFailSize = -1;
    let failSince: number | undefined;
    let attempted = false;

    while (true) {
        const preview = await ensureVideoPreview(file, attempted);
        if (preview)
            return preview;
        attempted = true;

        let size: number;
        try {
            size = (await fs.stat(file)).size;
        } catch {
            return undefined;
        }

        const now = Date.now();
        if (size !== lastFailSize || await isFileWriteLocked(file)) {
            lastFailSize = size;
            failSince = now;
            await sleep(FILE_SETTLE_POLL_MS);
            continue;
        }

        failSince ??= now;
        if (now - failSince >= VIDEO_PREVIEW_FAIL_STABLE_MS) {
            console.log(`Failed to generate video preview for ${path.basename(file)}`);
            return undefined;
        }
        await sleep(FILE_SETTLE_POLL_MS);
    }
}

async function addFileInner(file: string, hash?: string) {
    if (!hash)
        hash = hashPath(file);

    // Already indexed (e.g. moveImages beat the watcher) — do not clobber tags/annotation.
    // Change events can still retry a video that was indexed before its preview existed.
    const existing = getImageList().get(hash);
    if (existing) {
        if (isVideo(file) && !existing.preview)
            await attachVideoPreview(existing, file);
        return;
    }

    if (file.endsWith('.png')) {
        const video = videoExists(file);
        if (video) {
            if (!await waitUntilFileSettled(file))
                return;
            await updateImageMetadata(video, file);
            notifyImageChange();
            return;
        }
        await sleep(100);
        if (await videoExistsOnDisk(file)) {
            console.log(`Skipping image since a video for it exists: ${file}`);
            return;
        }
    }

    if (!await waitUntilFileSettled(file))
        return;

    if (isVideo(file)) {
        const image = videoPreviewExists(file);
        if (image)
            deleteFile(image.file);
        await ensureVideoPreviewReady(file);
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

type PreservedImageUserData = {
    tags: string[];
    annotation: string;
    embedding?: Float32Array;
    uniqueness?: number;
};

/**
 * Path-hash ids change on move/rename. Capture tags/annotation/embeddings before any
 * await (and before the watcher can unlink the old path and wipe DBs).
 */
function captureImageUserData(id: string, image?: ServerImage): PreservedImageUserData {
    const extra = MetaCalcDB.get(id);
    const embedding = EmbeddingDB.getEmbeddingsByIds([id])[0]?.embedding;
    const uniqueness = EmbeddingDB.getUniquenessScores([id]).get(id);
    return {
        tags: image?.tags ?? extra?.tags ?? [],
        annotation: image?.annotation ?? extra?.annotation ?? '',
        embedding,
        uniqueness,
    };
}

function cleanupIndexedImageId(id: string): void {
    getImageList().delete(id);
    deleteTempImage(id);
    MetaDB.delete(id);
    MetaCalcDB.delete(id);
    EmbeddingDB.deleteImage(id);
    removeFreshImage(id);
    recordDeletion(id);
}

function preservedHasUserData(preserved: PreservedImageUserData): boolean {
    return Boolean(
        preserved.tags.length
        || preserved.annotation
        || preserved.embedding
        || preserved.uniqueness !== undefined,
    );
}

function applyPreservedUserData(image: ServerImage, preserved: PreservedImageUserData): void {
    image.tags = [...preserved.tags];
    image.annotation = preserved.annotation;
}

/** Fill only missing tags/annotation so an empty late capture cannot wipe a winner. */
function fillPreservedUserData(image: ServerImage, preserved: PreservedImageUserData): void {
    if (preserved.tags.length && !image.tags?.length)
        image.tags = [...preserved.tags];
    if (preserved.annotation && !image.annotation)
        image.annotation = preserved.annotation;
}

function persistImageExtra(
    image: ServerImage,
    preserved?: PreservedImageUserData,
    mode: 'replace' | 'fill' = 'replace',
): void {
    MetaCalcDB.set({
        id: image.id,
        positive: image.positive,
        negative: image.negative,
        params: image.params,
        models: image.models,
        hash: image.hash,
        annotation: image.annotation,
        tags: image.tags,
    });
    if (!preserved)
        return;
    if (preserved.embedding && (mode === 'replace' || !EmbeddingDB.hasImageEmbedding(image.id)))
        EmbeddingDB.setImageEmbedding(image.id, preserved.embedding);
    if (preserved.uniqueness !== undefined && (mode === 'replace' || !EmbeddingDB.getUniquenessScores([image.id]).has(image.id)))
        EmbeddingDB.setUniquenessScore(image.id, preserved.uniqueness);
}

async function indexImageAfterPathChange(
    to: string,
    options: {
        oldId?: string;
        priorImage?: ServerImage;
        /** Prefer pre-captured data — required when the watcher may have already wiped the old id. */
        preserved?: PreservedImageUserData;
    },
): Promise<ServerImage> {
    const newhash = hashPath(to);
    const existing = getImageList().get(newhash);
    if (existing && existing.file === to) {
        // Destination already indexed (e.g. moveImages beat the watcher).
        if (options.oldId && options.oldId !== newhash)
            cleanupIndexedImageId(options.oldId);
        if (options.preserved && preservedHasUserData(options.preserved)) {
            fillPreservedUserData(existing, options.preserved);
            persistImageExtra(existing, options.preserved, 'fill');
        }
        return existing;
    }

    const preserved = options.preserved
        ?? (options.oldId ? captureImageUserData(options.oldId, options.priorImage) : undefined);

    if (options.oldId && options.oldId !== newhash) {
        cleanupIndexedImageId(options.oldId);
        if (options.priorImage)
            repairUniqueCacheAfterDeletes([...getImageList().values()], [options.priorImage]);
    }

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

    // Watcher and moveImages can both await readMetadata; keep the winner's entry.
    const raced = getImageList().get(newhash);
    if (raced && raced.file === to) {
        if (preserved && preservedHasUserData(preserved)) {
            fillPreservedUserData(raced, preserved);
            persistImageExtra(raced, preserved, 'fill');
        }
        return raced;
    }

    const image = getServerImage(full);
    if (preserved)
        applyPreservedUserData(image, preserved);

    getImageList().set(newhash, image);
    repairUniqueCacheOnAdd([...getImageList().values()], image);
    recordFreshImage(newhash);

    MetaDB.set(full);
    persistImageExtra(image, preserved);

    return image;
}

async function renameFile(from: string, to: string) {
    let affectedModifiedDate = Number.POSITIVE_INFINITY;
    let oldImage: ServerImage | undefined;
    let oldhash: string | undefined;
    let preserved: PreservedImageUserData | undefined;
    if (isMedia(from)) {
        oldhash = hashPath(from);
        oldImage = getImageList().get(oldhash);
        if (oldImage)
            affectedModifiedDate = Math.min(affectedModifiedDate, oldImage.modifiedDate);
        // Sync capture before any await — old DB rows may already be mid-delete elsewhere.
        preserved = captureImageUserData(oldhash, oldImage);
    }

    if (!isMedia(to)) {
        if (oldhash)
            cleanupIndexedImageId(oldhash);
        if (oldImage)
            repairUniqueCacheAfterDeletes([...getImageList().values()], [oldImage]);
        notifyImageChange();
        return;
    }
    console.log(`Renamed ${from} to ${to}`);

    const image = await indexImageAfterPathChange(to, {
        oldId: oldhash,
        priorImage: oldImage,
        preserved,
    });
    affectedModifiedDate = Math.min(affectedModifiedDate, image.modifiedDate);
    repairExplorationCaches(
        [...getImageList().values()],
        affectedModifiedDate,
        `renamed image ${path.basename(from)} to ${path.basename(to)}`,
    );

    notifyImageChange();
}

async function pollFiles() {
    await checkFiles();
    setTimeout(() => {
        pollFiles();
    }, pollingInterval);
}

async function checkFiles() {
    const dirs: string[] = getImageRoots().map((r) => r.path);
    const images = new Set([...getImageList().keys()]);

    while (dirs.length > 0) {
        const dir = dirs.pop();
        if (!dir) continue;
        let files: string[];
        try {
            files = await fs.readdir(dir);
        } catch {
            continue;
        }

        for (const file of files.filter(x => isMedia(x))) {
            const fullpath = path.join(dir, file);
            const hash = hashPath(fullpath);
            if (getImageList().has(hash)) {
                images.delete(hash);
                continue;
            }

            void addFile(fullpath, hash).catch((err) => {
                console.error(`Failed to index polled file ${fullpath}`, err);
            });
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

    const target = resolveTargetFolder(folder);
    if (!target.ok) {
        console.log(`Failed to move images: ${target.error}`);
        return;
    }

    let failcount = 0;
    let crossRoot = 0;
    let moved = 0;
    let oldestMoved = Number.POSITIVE_INFINITY;
    for (const id of ids) {
        const img = getImageList().get(id);
        if (!img)
            continue;

        const imageRoot = resolveImagePath(img.file)?.root;
        if (!imageRoot || imageRoot.key !== target.root.key) {
            crossRoot++;
            continue;
        }

        let newPath = path.join(target.absolute, removeFolderFromPath(img.file)!);
        if (img.file === newPath)
            continue;
        newPath = await fileUniquefy(newPath);

        // Capture before rename — watcher unlink can wipe DBs as soon as rename yields.
        const preserved = captureImageUserData(id, img);

        try {
            await fs.mkdir(target.absolute, { recursive: true });
            await fs.rename(img.file, newPath);
            oldestMoved = Math.min(oldestMoved, img.modifiedDate);
            deleteTextFiles(img.file);
            moved++;
        } catch {
            failcount++;
            continue;
        }

        if (img.preview) {
            try {
                const newPreview = `${splitExtension(newPath)[0]}.png`;
                await fs.rename(img.preview, newPreview);
                deleteTempImage(hashPath(img.preview));
            } catch {
                console.log(`Failed to move preview file ${img.preview}`);
            }
        }

        await indexImageAfterPathChange(newPath, { oldId: id, priorImage: img, preserved });
    }

    if (crossRoot)
        console.log(`Skipped moving ${crossRoot} images (cannot move across source roots)`);
    if (failcount)
        console.log(`Failed to move ${failcount} images`);
    if (moved) {
        repairExplorationCaches([...getImageList().values()], oldestMoved, `moved ${moved} images`);
        notifyImageChange();
    }
}

export async function copyImages(ids: string | string[], folder: string) {
    if (typeof ids === 'string') ids = [ids];

    const target = resolveTargetFolder(folder);
    if (!target.ok) {
        console.log(`Failed to copy images: ${target.error}`);
        return;
    }

    let failcount = 0;
    let crossRoot = 0;
    for (const id of ids) {
        const img = getImageList().get(id);
        if (!img)
            continue;

        const imageRoot = resolveImagePath(img.file)?.root;
        if (!imageRoot || imageRoot.key !== target.root.key) {
            crossRoot++;
            continue;
        }

        let newPath = path.join(target.absolute, removeFolderFromPath(img.file)!);
        if (img.file === newPath)
            continue;
        newPath = await fileUniquefy(newPath);

        try {
            await fs.mkdir(target.absolute, { recursive: true });
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

    if (crossRoot)
        console.log(`Skipped copying ${crossRoot} images (cannot copy across source roots)`);
    if (failcount)
        console.log(`Failed to copy ${failcount} images`);
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
