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
