/**
 * A repeatable generator in [0, 1) for a seed (any integer, also past 2^53 as a string):
 * the seed's digits hashed (cyrb53-style) into mulberry32's state.
 */
export function seededRandom(seed: number | string): () => number {
    const text = String(seed);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    let state = (Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)) >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Partial Fisher–Yates until the first match. Mutates `ids` in place.
 * Optional yielding is for long scans on the server event loop.
 */
export async function takeRandomMatch<T>(
    ids: string[],
    lookup: (id: string) => T | undefined,
    match: (item: T) => boolean,
    options: {
        yieldEvery?: number;
        yieldFn?: () => Promise<void>;
        isAborted?: () => boolean;
        random?: () => number;
    } = {},
): Promise<T | undefined> {
    const yieldEvery = options.yieldEvery ?? 0;
    const random = options.random ?? Math.random;
    let scanned = 0;

    for (let remaining = ids.length; remaining > 0; remaining--) {
        if (options.isAborted?.())
            return undefined;

        if (yieldEvery > 0 && options.yieldFn && ++scanned % yieldEvery === 0)
            await options.yieldFn();

        const index = Math.floor(random() * remaining);
        const id = ids[index];
        ids[index] = ids[remaining - 1];
        const item = lookup(id);
        if (item !== undefined && match(item))
            return item;
    }

    return undefined;
}
