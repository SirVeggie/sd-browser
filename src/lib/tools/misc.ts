import type { ClientImage } from "$lib/types";

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
    return res;
}