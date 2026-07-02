import { MetaDB, MetaCalcDB } from '../db';
import { openDatabase } from '../sqlite';
import { datapath } from '../paths';
import { fileExistsSync } from '../filetools';
import path from 'path';

/** v1 → v2: drop extradata so startup recreates it with the current schema and recalculates rows. */
export async function migrateV2() {
    MetaDB.ensureColumnFull('extra', 'TEXT');

    const appDataPath = path.join(datapath, 'appdata.sqlite3');
    if (fileExistsSync(appDataPath)) {
        const db = openDatabase(appDataPath);
        try {
            db.exec(`DROP TABLE IF EXISTS extradata`);
        } catch (err) {
            console.log('Failed to drop extradata table during v2 migration');
            console.error(err);
        } finally {
            db.close();
        }
    }

    MetaCalcDB.ensureColumn('models', 'TEXT');
    MetaCalcDB.ensureColumn('annotation', 'TEXT');
}
