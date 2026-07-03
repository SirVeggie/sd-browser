import Database from 'better-sqlite3';
import type { Database as BetterSqlite3 } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export function openDatabase(filePath: string, loadVec = false): BetterSqlite3 {
    const db = new Database(filePath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -20000');
    db.pragma('temp_store = MEMORY');
    if (loadVec) {
        sqliteVec.load(db);
    }
    return db;
}
