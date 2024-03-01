import type { ClientImage } from "$lib/types";
import { RePromise, RePromisify } from "./RePromise";
import rl from "readline";

export function XOR(a: any, b: any): boolean {
    return !a !== !b;
}

export function mapImagesToClient(ids: string[]): ClientImage[] {
    return ids.map(id => ({
        id,
        url: `/api/images/${id}`,
    }));
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
    const res: T[] = [];
    const copy = [...array];
    amount = Math.min(amount, copy.length);
    for (let i = 0; i < amount; i++) {
        const index = randomIndex(copy);
        res.push(copy[index]);
        copy.splice(index, 1);
    }
    return res;
}

export function splitPromptParams(str: string): string[] {
    const res: string[] = [];
    let prev = 0;
    let inQuotes = false;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '"' && str[i - 1] !== '\\') {
            inQuotes = !inQuotes;
        } else if (str[i] === ',' && !inQuotes) {
            res.push(str.slice(prev, i).trim());
            prev = i + 1;
        }
    }
    res.push(str.slice(prev).trim());
    const hiddenParams = ["sv_prompt", "sv_negative"];
    return res.filter(s => !hiddenParams.includes(s.split(":")[0].trim()));
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