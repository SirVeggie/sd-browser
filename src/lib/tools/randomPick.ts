/** cyrb53: a fast 53-bit string hash. */
function cyrb53(text: string, seed = 0): number {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * A seed's score for each id (any integer seed, also past 2^53 as a string). The seeded pick is
 * the matching id with the lowest score, so it depends only on the seed and the matching ids:
 * images added elsewhere in the library don't move it, and a new match takes over only when it
 * scores lower.
 */
export function seededScore(seed: number | string): (id: string) => number {
    const s = cyrb53(String(seed)) % 4294967296 | 0;
    return (id) => cyrb53(id, s);
}

/** The matching item with the lowest seeded score (ties: the smaller id). */
export async function takeSeededMatch<T>(
    ids: Iterable<string>,
    seed: number | string,
    lookup: (id: string) => T | undefined,
    match: (item: T) => boolean,
    options: {
        yieldEvery?: number;
        yieldFn?: () => Promise<void>;
        isAborted?: () => boolean;
    } = {},
): Promise<T | undefined> {
    const score = seededScore(seed);
    const yieldEvery = options.yieldEvery ?? 0;
    let best: T | undefined;
    let bestScore = Infinity;
    let bestId = '';
    let scanned = 0;
    for (const id of ids) {
        if (options.isAborted?.())
            return undefined;
        if (yieldEvery > 0 && options.yieldFn && ++scanned % yieldEvery === 0)
            await options.yieldFn();
        const s = score(id);
        if (s > bestScore || (s === bestScore && id >= bestId))
            continue;
        const item = lookup(id);
        if (item !== undefined && match(item)) {
            best = item;
            bestScore = s;
            bestId = id;
        }
    }
    return best;
}

/**
 * Recent seeded picks by request, so asking again skips the search. An entry holds while
 * `stamp` is unchanged (e.g. the image list and its size) and for `ttlMs` at most.
 */
export class PickCache<S> {
    private entries = new Map<string, { id: string; stamp: S; at: number }>();
    private readonly max: number;
    private readonly ttlMs: number;
    private readonly now: () => number;

    constructor(max = 200, ttlMs = 5 * 60_000, now = () => Date.now()) {
        this.max = max;
        this.ttlMs = ttlMs;
        this.now = now;
    }

    get(key: string, stamp: S): string | undefined {
        const entry = this.entries.get(key);
        if (!entry)
            return undefined;
        if (entry.stamp !== stamp || this.now() - entry.at > this.ttlMs) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.id;
    }

    set(key: string, stamp: S, id: string): void {
        this.entries.delete(key);
        this.entries.set(key, { id, stamp, at: this.now() });
        while (this.entries.size > this.max)
            this.entries.delete(this.entries.keys().next().value!);
    }
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
    } = {},
): Promise<T | undefined> {
    const yieldEvery = options.yieldEvery ?? 0;
    let scanned = 0;

    for (let remaining = ids.length; remaining > 0; remaining--) {
        if (options.isAborted?.())
            return undefined;

        if (yieldEvery > 0 && options.yieldFn && ++scanned % yieldEvery === 0)
            await options.yieldFn();

        const index = Math.floor(Math.random() * remaining);
        const id = ids[index];
        ids[index] = ids[remaining - 1];
        const item = lookup(id);
        if (item !== undefined && match(item))
            return item;
    }

    return undefined;
}
