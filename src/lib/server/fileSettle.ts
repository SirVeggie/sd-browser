import fs from 'fs/promises';

export const FILE_SETTLE_POLL_MS = 500;
export const FILE_SETTLE_STABLE_MS = 500;
export const FILE_SETTLE_EMPTY_TIMEOUT_MS = 60_000;

export type FileSettleOptions = {
    pollMs?: number;
    stableMs?: number;
    emptyTimeoutMs?: number;
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(err: unknown): string | undefined {
    if (!err || typeof err !== 'object' || !('code' in err))
        return undefined;
    return typeof err.code === 'string' ? err.code : undefined;
}

/** True when another process likely still has the file open for write. */
export async function isFileWriteLocked(file: string): Promise<boolean> {
    try {
        const handle = await fs.open(file, 'r+');
        await handle.close();
        return false;
    } catch (err) {
        const code = errorCode(err);
        return code === 'EBUSY' || code === 'ETXTBSY' || code === 'ENOENT';
    }
}

/**
 * Wait until a file has non-zero size, has not grown for `stableMs`, and is not
 * write-locked. Returns false if the file vanishes or stays empty until timeout.
 */
export async function waitUntilFileSettled(
    file: string,
    options?: FileSettleOptions,
): Promise<boolean> {
    const pollMs = options?.pollMs ?? FILE_SETTLE_POLL_MS;
    const stableMs = options?.stableMs ?? FILE_SETTLE_STABLE_MS;
    const emptyTimeoutMs = options?.emptyTimeoutMs ?? FILE_SETTLE_EMPTY_TIMEOUT_MS;

    let lastSize = -1;
    let stableSince: number | undefined;
    let emptySince: number | undefined;

    while (true) {
        let size: number;
        try {
            const stats = await fs.stat(file);
            if (!stats.isFile())
                return false;
            size = stats.size;
        } catch {
            return false;
        }

        const now = Date.now();
        if (size === 0) {
            emptySince ??= now;
            if (now - emptySince >= emptyTimeoutMs)
                return false;
            lastSize = 0;
            stableSince = undefined;
            await sleep(pollMs);
            continue;
        }
        emptySince = undefined;

        if (size !== lastSize) {
            lastSize = size;
            stableSince = now;
            await sleep(pollMs);
            continue;
        }

        if (stableSince === undefined || now - stableSince < stableMs) {
            await sleep(pollMs);
            continue;
        }

        if (await isFileWriteLocked(file)) {
            await sleep(pollMs);
            continue;
        }

        return true;
    }
}
