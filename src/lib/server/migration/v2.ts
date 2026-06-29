import Database, { type Database as DB3 } from 'better-sqlite3';
import { MetaDB, MetaCalcDB } from '../db';
import { datapath } from '../filemanager';
import path from 'path';

/** v1 → v2: drop extradata so startup recreates it with the current schema and recalculates rows. */
export async function migrateV2() {
    MetaDB.ensureColumnFull('extra', 'TEXT');
    new Database(path.join(datapath, 'appdata.sqlite3')).exec(`DROP TABLE IF EXISTS extradata`).close();
    MetaCalcDB.ensureColumn('models', 'TEXT');
    MetaCalcDB.ensureColumn('annotation', 'TEXT');
}
