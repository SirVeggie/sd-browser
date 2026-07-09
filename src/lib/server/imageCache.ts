import fs from 'fs/promises';
import path from 'path';
import { qualityTierPaths } from './paths';

export async function clearCompressedImages(): Promise<number> {
    let deleted = 0;
    for (const tierPath of Object.values(qualityTierPaths)) {
        const files = await fs.readdir(tierPath).catch(() => [] as string[]);
        for (const file of files) {
            if (!file.endsWith('.webp')) continue;
            const removed = await fs.unlink(path.join(tierPath, file)).then(() => true).catch(() => false);
            if (removed) deleted++;
        }
    }
    return deleted;
}
