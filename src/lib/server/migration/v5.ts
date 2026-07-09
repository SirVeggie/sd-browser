import fs from 'fs/promises';
import path from 'path';
import { calcProgress, updateLine } from '$lib/tools/misc';
import {
    legacyCompressedPath,
    legacyThumbnailPath,
    lowPath,
    mediumPath,
    minimalPath,
} from '../paths';
import { fileExists, folderExists } from '../filetools';

const LEGACY_MOVES = [
    { from: legacyCompressedPath, to: mediumPath, label: 'compressed → medium' },
    { from: legacyThumbnailPath, to: lowPath, label: 'thumbnails → low' },
] as const;

async function removeLegacyFolder(from: string, to: string) {
    const entries = await fs.readdir(from);
    for (const file of entries) {
        if (!file.endsWith('.webp'))
            continue;

        const destination = path.join(to, file);
        if (await fileExists(destination))
            await fs.unlink(path.join(from, file)).catch(() => {});
    }

    const remaining = await fs.readdir(from);
    if (!remaining.length) {
        await fs.rmdir(from);
        console.log(`Removed legacy folder: ${from}`);
    }
}

/** v4 → v5: rename generated image cache folders to match quality tiers. */
export async function migrateV5() {
    await fs.mkdir(minimalPath, { recursive: true });

    for (const { from, to, label } of LEGACY_MOVES) {
        if (!(await folderExists(from))) {
            await fs.mkdir(to, { recursive: true });
            continue;
        }

        await fs.mkdir(to, { recursive: true });
        const files = (await fs.readdir(from)).filter((file) => file.endsWith('.webp'));
        let moved = 0;
        let skipped = 0;
        let failed = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const source = path.join(from, file);
            const destination = path.join(to, file);

            if (i % 100 === 0 || i === files.length - 1) {
                updateLine(`Migrating ${label}: ${calcProgress(i + 1, files.length)}`);
            }

            if (await fileExists(destination)) {
                skipped++;
                continue;
            }

            try {
                await fs.rename(source, destination);
                moved++;
            } catch {
                failed++;
            }
        }

        console.log(`Migrated ${label}: moved ${moved}, skipped ${skipped}, failed ${failed}`);

        if (!failed)
            await removeLegacyFolder(from, to);
    }
}
