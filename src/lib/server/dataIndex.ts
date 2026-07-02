import type { ImageList, ServerImage, TimedImage } from '$lib/types/images';
import { MetaCalcDB } from './db';
import { populateServerImage } from './imageUtils';

const freshLimit = 1000;

let imageList: ImageList = new Map();
let freshList: TimedImage[] = [];
const nsfwList: string[] = [];
const favoriteList: string[] = [];
const deletionList: TimedImage[] = [];

export let generationDisabled = false;

export function setGenerationDisabled(disabled: boolean) {
    generationDisabled = disabled;
}

export function getImage(imageid: string) {
    return imageList.get(imageid);
}

export function getImageList() {
    return imageList;
}

export function replaceImageList(list: ImageList) {
    imageList = list;
}

export function refreshExtradataInMemory() {
    for (const data of MetaCalcDB.getAll()) {
        const image = imageList.get(data.id);
        if (image)
            populateServerImage(image, data);
    }
}

export function recordFreshImage(id: string) {
    const amount = freshList.unshift({
        id,
        timestamp: Date.now(),
    });
    if (amount > freshLimit)
        freshList.pop();
}

export function removeFreshImage(id: string) {
    freshList = freshList.filter(x => x.id !== id);
}

export function recordDeletion(id: string) {
    const size = deletionList.unshift({
        id,
        timestamp: Date.now(),
    });
    if (size > freshLimit)
        deletionList.pop();
}

export function getFreshImages(timestamp: number) {
    const res: ServerImage[] = [];
    for (const item of freshList) {
        const img = imageList.get(item.id);
        if (!img) continue;
        if (item.timestamp <= timestamp)
            break;

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
        if (deletion.timestamp <= timestamp)
            break;

        res.push(deletion.id);
    }
    return res;
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
