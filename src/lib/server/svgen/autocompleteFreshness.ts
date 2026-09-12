export function fileMtimeMs(mtimeMs: number): number {
    return Math.trunc(mtimeMs);
}

export function storedSourceFileMtime(value: number | null | undefined): number | null {
    if (value == null || value === 0)
        return null;
    return value;
}

/** Missing file → do not reindex. Unknown stored mtime → reindex only if the file is newer than last index. */
export function sourceFileNeedsReindex(
    storedMtime: number | null | undefined,
    indexedAt: number,
    fileMtime: number | null,
): boolean {
    if (fileMtime == null)
        return false;
    const stored = storedSourceFileMtime(storedMtime);
    if (stored == null)
        return fileMtime > indexedAt;
    return fileMtime !== stored;
}
