import { IMG_FOLDER } from '$env/static/private';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { ImageList, SearchMode, ServerImage, SortingMethod } from '$lib/types';
import fs from 'fs/promises';
import exifr from 'exifr';
import { getPositivePrompt } from '$lib/tools/metadataInterpreter';
import Watcher from 'watcher';
import type { WatcherOptions } from 'watcher/dist/types';

let imageList: ImageList = new Map();
const datapath = './localData';
let watcher: Watcher | undefined;

export async function startFileManager() {
    await indexFiles();
    setupWatcher();
}

export async function indexFiles() {
    console.log('Indexing files...');
    fs.mkdir(datapath).catch(() => console.log('Failed to create data folder, might already exist'));

    // Read cached data
    let imageCache: ImageList | undefined;
    const images: ImageList = new Map();
    const cachefile = path.join(datapath, 'metadata.json');
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
        console.log(`Indexing ${dir}`);
        const files = await readdir(dir);

        for (const file of files.filter(x => x.endsWith('.png'))) {
            const fullpath = path.join(dir, file);
            const hash = hashString(fullpath);
            if (imageCache && imageCache.has(hash)) {
                images.set(hash, imageCache.get(hash)!);
                continue;
            }

            const metadata = await readMetadata(fullpath);
            images.set(hash, {
                id: hash,
                file: fullpath,
                modifiedDate: 0,
                createdDate: 0,
                ...metadata,
            });
        }

        for (const file of files.filter(x => !x.endsWith('.png'))) {
            const fullpath = path.join(dir, file);
            const stats = await stat(fullpath);
            if (stats.isDirectory()) dirs.push(fullpath);
        }
    }

    console.log('Writing cache file...');
    fs.writeFile(cachefile, JSON.stringify([...images], null, 2)).catch(e => console.log(e));

    imageList = images;
    console.log(`Indexed ${imageList.size} images`);
}

function setupWatcher() {
    const options: WatcherOptions = {
        recursive: true,
        ignoreInitial: true,
    };

    if (watcher) watcher.close();
    watcher = new Watcher(IMG_FOLDER, options);
    // watcher.on('all', async (event, file) => {
    //     if (!event.includes('Dir') && !file.endsWith('.png')) return;
    //     console.log(`${event}: ${file}`);
    // });

    watcher.on('add', async file => {
        if (!file.endsWith('.png')) return;
        const hash = hashString(file);
        imageList.set(hash, {
            id: hash,
            file,
            modifiedDate: 0,
            createdDate: 0,
            ...await readMetadata(file),
        });
        // trigger frontend update?
    });

    watcher.on('rename', async (from, to) => {
        if (from.endsWith('.png')) {
            const oldhash = hashString(from);
            imageList.delete(oldhash);
        }

        if (!to.endsWith('.png')) return;
        const newhash = hashString(to);
        imageList.set(newhash, {
            id: newhash,
            file: to,
            modifiedDate: 0,
            createdDate: 0,
            ...await readMetadata(to),
        });
    });

    watcher.on('unlink', async file => {
        if (!file.endsWith('.png')) return;
        const hash = hashString(file);
        imageList.delete(hash);
    });

    watcher.on('addDir', () => {
        indexFiles();
    });

    watcher.on('renameDir', () => {
        indexFiles();
    });

    watcher.on('unlinkDir', dir => {
        for (const [key, value] of imageList) {
            if (value.file.startsWith(dir)) {
                imageList.delete(key);
            }
        }
    });

    console.log('Listening to file changes...');
}

export function getImage(imageid: string) {
    const image = imageList.get(imageid);
    return image;
}

export function searchImages(search: string, mode: SearchMode) {
    switch (mode) {
        case 'contains':
            return searchImagesContains(search);
        case 'regex':
            return searchImagesRegex(search);
        default:
            return [];
    }
}

function searchImagesContains(search: string): ServerImage[] {
    const list: ServerImage[] = [];
    for (const [, value] of imageList) {
        if (getPositivePrompt(value.prompt).includes(search)) {
            list.push(value);
        }
    }
    return list;
}

function searchImagesRegex(search: string): ServerImage[] {
    const list: ServerImage[] = [];
    const regex = new RegExp(search, 'i');
    for (const [, value] of imageList) {
        if (regex.test(getPositivePrompt(value.prompt))) {
            list.push(value);
        }
    }
    return list;
}

export function sortImages(images: ServerImage[], sort: SortingMethod): ServerImage[] {
    switch (sort) {
        case 'date':
            return [...images].sort(createComparer<ServerImage>(x => x.modifiedDate, true));
        case 'name':
            return [...images].sort(createComparer<ServerImage>(x => x.file, false));
        default:
            return [];
    }
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
    hash.update(filepath);
    return hash.digest('hex');
}

async function readMetadata(imagepath: string): Promise<Partial<ServerImage>> {
    try {
        const stats = await stat(imagepath);
        const res: Partial<ServerImage> = {
            modifiedDate: stats.mtimeMs,
            createdDate: stats.birthtimeMs,
        };

        const file = await fs.readFile(imagepath);
        let metadata = await exifr.parse(file);
        if (!metadata)
            return {};
        metadata = {
            ...res,
            prompt: metadata.parameters ?? undefined
        } satisfies Partial<ServerImage>;

        return metadata;
    } catch {
        console.log(`Failed to read metadata for ${imagepath}`);
        return {};
    }
}