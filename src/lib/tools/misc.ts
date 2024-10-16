import type { ClientImage, ServerImage } from "$lib/types";
import { RePromise, RePromisify } from "./RePromise";
import rl from "readline";

export const imageFiletypes = ['png', 'jpg', 'jpeg', 'webp'] as const;
export const txtFiletypes = ['txt', 'yaml', 'yml', 'json'] as const;
export const videoFiletypes = ['mp4'] as const;

export function XOR(a: any, b: any): boolean {
    return !a !== !b;
}

export function expandClientImages(images: Omit<ClientImage, 'url'>[]): ClientImage[] {
    return images.map(img => ({
        id: img.id,
        url: `/api/images/${img.id}`,
        type: img.type,
    }));
}

export function mapServerImageToClient(images: ServerImage[]): Omit<ClientImage, 'url'>[] {
    return images.map(img => ({
        id: img.id,
        type: getImageType(img),
    }));
}

export function getImageType(image: ServerImage): undefined | 'video' {
    return isVideo(image.file) ? 'video' : undefined;
}

export function validRegex(str: string): boolean {
    try {
        new RegExp(str);
        return true;
    } catch {
        return false;
    }
}

export function randomIndex(array: any[]) {
    return Math.floor(Math.random() * array.length);
}

export function selectRandom<T>(array: T[], amount: number): T[] {
    const copy = [...array];
    copy.sort(() => Math.random() - 0.5);
    return copy.slice(0, amount);
}

export async function limitedParallelMap<T, U>(
    array: T[],
    callback: (item: T) => Promise<U>,
    limit: number
): Promise<U[]> {
    const res: U[] = [];
    const promises: RePromise<U>[] = [];

    for (const item of [...array]) {
        promises.push(RePromisify(callback(item)));
        if (promises.length === limit) {
            await Promise.race(promises);
            for (let i = promises.length - 1; i >= 0; i--) {
                if (promises[i].state === 'resolved') {
                    res.push(promises[i].value!);
                    promises.splice(i, 1);
                } else if (promises[i].state === 'rejected') {
                    throw promises[i].reason;
                }
            }
        }
    }

    for (const promise of promises) {
        res.push(await promise);
    }

    return res;
}

export function print(str: string) {
    process.stdout.write(str);
}

export function printLine(str: string) {
    process.stdout.write(str + "\n");
}

export function updateLine(str: string) {
    rl.cursorTo(process.stdout, 0);
    rl.clearLine(process.stdout, 0);
    process.stdout.write(str);
}

export function calcTimeSpent(start: number) {
    const ms = Date.now() - start;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor(ms / 1000 % 60);
    const smin = minutes !== 1 ? 's' : '';
    const ssec = seconds !== 1 ? 's' : '';
    let res = minutes ? `${minutes} minute${smin}` : '';
    res += seconds ? `${res ? ' ' : ''}${seconds} second${ssec}` : '';
    res += res ? '' : `${ms} ms`;
    return res;
}

export function* reverseYield<T>(array: T[]): Generator<T> {
    for (let i = array.length - 1; i >= 0; i--) {
        yield array[i];
    }
}

export function isMedia(file: string) {
    return isImage(file) || isVideo(file);
}

export function isImage(file: string) {
    return imageFiletypes.some(x => file.endsWith(`.${x}`));
}

export function isVideo(file: string) {
    return videoFiletypes.some(x => file.endsWith(`.${x}`));
}

export function isTxt(file: string) {
    return txtFiletypes.some(x => file.endsWith(`.${x}`));
}

export function formatHasMetadata(file: string) {
    return file.endsWith(".png");
}

export function skipGeneration(file: string) {
    return file.endsWith(".webp") || isVideo(file);
}

export function removeExtension(file: string) {
    return file.replace(/\.[^\\/.]+$/, '');
}