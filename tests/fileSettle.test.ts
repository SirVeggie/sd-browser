import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isFileWriteLocked, waitUntilFileSettled } from '../src/lib/server/fileSettle.ts';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-settle-'));

try {
    {
        const missing = path.join(dir, 'missing.bin');
        assert.equal(
            await waitUntilFileSettled(missing, { pollMs: 20, emptyTimeoutMs: 40 }),
            false,
            'missing file is not settled',
        );
    }

    {
        const file = path.join(dir, 'empty.bin');
        await fs.writeFile(file, '');
        const started = Date.now();
        assert.equal(
            await waitUntilFileSettled(file, { pollMs: 20, emptyTimeoutMs: 80 }),
            false,
            'empty file is not settled',
        );
        assert.ok(Date.now() - started >= 80, 'empty timeout is waited');
        assert.equal(await isFileWriteLocked(file), false, 'unlocked empty file');
    }

    {
        const file = path.join(dir, 'ready.bin');
        await fs.writeFile(file, 'hello');
        assert.equal(
            await waitUntilFileSettled(file, { pollMs: 20, stableMs: 40 }),
            true,
            'non-empty idle file settles',
        );
    }

    {
        const file = path.join(dir, 'growing.bin');
        await fs.writeFile(file, 'a');
        const settled = waitUntilFileSettled(file, { pollMs: 20, stableMs: 120, emptyTimeoutMs: 2000 });
        await sleep(50);
        await fs.appendFile(file, 'b');
        const started = Date.now();
        assert.equal(await settled, true, 'growing file eventually settles');
        assert.ok(Date.now() - started >= 70, 'settle waits after last growth');
    }

    console.log('fileSettle.test.ts: all tests passed');
} finally {
    await fs.rm(dir, { recursive: true, force: true });
}
