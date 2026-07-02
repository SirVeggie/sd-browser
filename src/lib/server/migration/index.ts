import { MiscDB } from '../db';
import { migrateV1 } from './v1';
import { migrateV2 } from './v2';
import { migrateV3 } from './v3';
import { migrateV4 } from './v4';

export const APP_VERSION = 4;

function parseStoredVersion(storedVersion: string | undefined): number {
    if (!storedVersion)
        return APP_VERSION;
    const parsed = Number.parseInt(storedVersion, 10);
    return Number.isNaN(parsed) ? APP_VERSION : parsed;
}

function getStoredVersion(): number {
    return parseStoredVersion(MiscDB.get('version'));
}

function bumpVersion(to: number) {
    MiscDB.set('version', String(to));
}

/** File-layout migrations that must run before MetaDB opens. */
export async function handleMigrationStart() {
    const version = getStoredVersion();
    MiscDB.close(true);

    if (version < 1) {
        await migrateV1();
        bumpVersion(1);
    }
    if (version < 2) {
        await migrateV2();
        bumpVersion(2);
    }
    if (version < 3) {
        await migrateV3();
        bumpVersion(3);
    }
    if (version < 4) {
        migrateV4();
        bumpVersion(4);
    }
}

/** Ensures version matches APP_VERSION after indexing (including fresh installs). */
export function handleMigrationEnd() {
    bumpVersion(APP_VERSION);
}
