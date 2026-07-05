import type { ClientImage, ServerImage } from "$lib/types/images";
import shuffle from "lodash/shuffle";
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
        width: img.width || undefined,
        height: img.height || undefined,
    }));
}

export function mapServerImageToClient(images: ServerImage[]): Omit<ClientImage, 'url'>[] {
    return images.map(img => ({
        id: img.id,
        type: getImageType(img),
        width: img.width || undefined,
        height: img.height || undefined,
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

export function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

export function selectRandom<T>(array: T[], amount: number): T[] {
    return shuffle(array).slice(0, amount);
}

export async function limitedParallelMap<T, U>(
    array: T[],
    callback: (item: T) => Promise<U>,
    limit: number,
    shouldContinue: () => boolean = () => true,
): Promise<U[]> {
    if (!array.length) return [];

    const results: U[] = new Array(array.length);
    let nextIndex = 0;

    async function worker() {
        while (shouldContinue()) {
            const index = nextIndex++;
            if (index >= array.length) return;
            results[index] = await callback(array[index]);
        }
    }

    const workerCount = Math.min(Math.max(1, limit), array.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
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
    return calcTimeString(Date.now() - start);
}

export function calcTimeRemaining(start: number, current: number, total: number) {
    const elapsed = Date.now() - start;
    const timeRemaining = total / current * (Date.now() - start) - elapsed;
    return calcTimeString(timeRemaining);
}

export function calcTimeString(ms: number) {
    ms = Math.round(ms);
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor(ms / 1000 % 60);
    const smin = minutes !== 1 ? 's' : '';
    const ssec = seconds !== 1 ? 's' : '';
    let res = minutes ? `${minutes} minute${smin}` : '';
    res += seconds ? `${res ? ' ' : ''}${seconds} second${ssec}` : '';
    res += res ? '' : `${ms} ms`;
    return res;
}

export function formatDurationCompact(ms: number) {
    ms = Math.max(0, Math.round(ms));
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const parts: string[] = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds || !parts.length) parts.push(`${seconds}s`);
    return parts.join(' ');
}

export function applyResultTransform(text: string, pattern?: string, template?: string) {
    if (!pattern) return text;
    try {
        const match = text.match(new RegExp(pattern, "si"));
        if (!match) return "";
        const tpl = template?.trim();
        if (!tpl) return match[1] ?? match[0];
        return tpl.replace(/\$(\d+)/g, (_, index) => match[Number(index)] ?? "");
    } catch {
        return text;
    }
}

export function formatTaskDuration(ms: number) {
    ms = Math.max(0, ms);
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const precise = ms <= 10000;
    const seconds = precise
        ? (ms % 60000) / 1000
        : Math.floor((ms % 60000) / 1000);
    const parts: string[] = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (precise) {
        parts.push(`${seconds.toFixed(2)}s`);
    } else if (seconds || !parts.length) {
        parts.push(`${seconds}s`);
    }
    return parts.join(' ');
}

export function calcProgress(current: number, total: number) {
    const percentage = current / total * 100;
    return percentage.toFixed(1);
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

export function isMetadataFiletype(file: string) {
    return file.endsWith(".png");
}

export function skipGeneration(file: string) {
    return file.endsWith(".webp") || isVideo(file);
}

export function removeExtension(file: string) {
    return file.replace(/\.[^\\/.]+$/, '');
}

export function stringSortSingle(a: string, b: string) {
    return a < b ? -1 : a > b ? 1 : 0;
}

export function stringSort<T>(map: (x: T) => string) {
    return (a: T, b: T) => stringSortSingle(map(a), map(b));
}

export function* irange(start: number, stop?: number, step = 1) {
    if (step <= 0)
        throw new Error("step must be positive");
    if (stop === undefined) {
        stop = start;
        start = 0;
    }

    if (start > stop)
        step = -step;
    for (let i = start; start <= stop ? i < stop : i > stop; i += step) {
        yield i;
    }
}

export function range(start: number, stop?: number, step = 1) {
    return [...irange(start, stop, step)];
}

const absoluteDateTokenRegex = /^\d{4}(\.|-|\/)\d{1,2}(\.|-|\/)\d{1,2}$/;
const timeTokenRegex = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/;
const offsetTokenRegex = /^(-?\d+)([ymdh])$/i;

export type DateBoundary = 'start' | 'end';

type ParsedOffset = { value: number; unit: 'y' | 'm' | 'd' | 'h' };

function applyDateOffset(date: Date, offset: ParsedOffset): void {
    switch (offset.unit) {
        case 'y':
            date.setFullYear(date.getFullYear() + offset.value);
            break;
        case 'm':
            date.setMonth(date.getMonth() + offset.value);
            break;
        case 'd':
            date.setDate(date.getDate() + offset.value);
            break;
        case 'h':
            date.setHours(date.getHours() + offset.value);
            break;
        default: {
            const _exhaustive: never = offset.unit;
            throw new Error(`unknown offset unit '${_exhaustive}'`);
        }
    }
}

function snapToDayBoundary(date: Date, boundary: DateBoundary): void {
    if (boundary === 'start') {
        date.setHours(0, 0, 0, 0);
    } else {
        date.setHours(23, 59, 59, 999);
    }
}

function applyExplicitTime(
    date: Date,
    hours: number,
    minutes: number,
    seconds: number,
    boundary: DateBoundary,
    hasSeconds: boolean,
): void {
    if (boundary === 'start') {
        date.setHours(hours, minutes, seconds, 0);
        return;
    }
    if (hasSeconds) {
        date.setHours(hours, minutes, seconds, 999);
    } else {
        date.setHours(hours, minutes, 59, 999);
    }
}

export function formatSearchDateMinute(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}`;
}

export function parseSearchFloat(value: string): number | undefined {
    const trimmed = value.trim();
    if (!/^-?\d*[.,]?\d+$/.test(trimmed)) return undefined;

    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed)) return undefined;

    return parsed;
}

export function parseSearchDate(value: string, boundary: DateBoundary): number {
    const trimmed = value.trim();
    if (trimmed === 'n') return Math.ceil(Date.now());
    if (/^\d+$/.test(trimmed)) return Number(trimmed);

    const parts = trimmed.split(/\s+/);
    let date: Date | null = null;
    let hadExplicitTime = false;
    let shouldSnapToDayBoundary = false;
    let lastTimeHasSeconds = false;

    for (const part of parts) {
        if (absoluteDateTokenRegex.test(part)) {
            const dateParts = part.split(/[-/.]/);
            const year = Number(dateParts[0]);
            const month = Number(dateParts[1]);
            const day = Number(dateParts[2]);
            if (date === null) {
                date = new Date(year, month - 1, day, 0, 0, 0, 0);
            } else {
                date.setFullYear(year, month - 1, day);
            }
            shouldSnapToDayBoundary = true;
            continue;
        }

        const timeMatch = part.match(timeTokenRegex);
        if (timeMatch) {
            if (date === null) date = new Date();
            const hours = Number(timeMatch[1]);
            const minutes = Number(timeMatch[2]);
            const seconds = Number(timeMatch[3] ?? 0);
            lastTimeHasSeconds = timeMatch[3] !== undefined;
            date.setHours(hours, minutes, seconds, 0);
            hadExplicitTime = true;
            continue;
        }

        const offsetMatch = part.match(offsetTokenRegex);
        if (offsetMatch) {
            if (date === null) date = new Date();
            const unit = offsetMatch[2].toLowerCase();
            if (unit !== 'y' && unit !== 'm' && unit !== 'd' && unit !== 'h') {
                throw new Error(`unknown date format for value '${value}'`);
            }
            applyDateOffset(date, { value: Number(offsetMatch[1]), unit });
            if (unit === 'y' || unit === 'm' || unit === 'd') {
                shouldSnapToDayBoundary = true;
            }
            continue;
        }

        throw new Error(`unknown date format for value '${value}'`);
    }

    if (date === null) {
        throw new Error(`unknown date format for value '${value}'`);
    }

    if (!hadExplicitTime && shouldSnapToDayBoundary) {
        snapToDayBoundary(date, boundary);
    } else if (hadExplicitTime) {
        applyExplicitTime(
            date,
            date.getHours(),
            date.getMinutes(),
            date.getSeconds(),
            boundary,
            lastTimeHasSeconds,
        );
    }

    return date.getTime();
}

export function lazy<T>(iterable: Iterable<T>): LazyExecutor<T> {
    return new LazyExecutor(iterable);
}

class LazyExecutor<T> {
    private iterable;

    constructor(iterable: Iterable<T>) {
        this.iterable = iterable;
    }

    filter(fn: (item: T, index: number) => boolean) {
        return lazy(LazyExecutor._filter(this.iterable, fn));
    }

    map<U>(fn: (item: T, index: number) => U) {
        return lazy(LazyExecutor._map(this.iterable, fn));
    }

    forEach(fn: (item: T, index: number) => void) {
        let index = 0;
        for (const item of this.iterable) {
            fn(item, index);
            index++;
        }
    }

    collect() {
        return [...this.iterable];
    }

    count() {
        let amount = 0;
        for (const _ of this.iterable) {
            amount++;
        }
        return amount;
    }

    *[Symbol.iterator]() {
        for (const item of this.iterable) {
            yield item;
        }
    }

    static * _filter<T>(iterable: Iterable<T>, fn: (item: T, index: number) => boolean) {
        let index = 0;
        for (const item of iterable) {
            if (fn(item, index)) {
                yield item;
            }
            index++;
        }
    }

    static * _map<T, U>(iterable: Iterable<T>, fn: (item: T, index: number) => U) {
        let index = 0;
        for (const item of iterable) {
            yield fn(item, index);
            index++;
        }
    }
}
