import type { Database as BetterSqlite3, Statement } from 'better-sqlite3';
import path from 'path';
import { datapath } from './filemanager';
import { openDatabase } from './sqlite';
import type { ImageExtraData, ServerImage, ServerImageFull, ServerImagePartial } from '$lib/types/images';
import { deleteFileSync, fileExistsSync } from './filetools';

export function sqliteTableExists(db: BetterSqlite3, table: string): boolean {
    const result = db.prepare(
        `SELECT count(*) as count FROM sqlite_master WHERE type = 'table' AND name = ?`,
    ).get(table) as { count: number };
    return !!result.count;
}

export class MetaDB {
    private static fShort = 'metadata.sqlite3';
    private static fFull = 'workflows.sqlite3';
    private static tShort = 'short';
    private static tFull = 'full';
    private static sqlCreate = `
    CREATE TABLE IF NOT EXISTS ${MetaDB.tShort} (
        id TEXT PRIMARY KEY,
        file TEXT NOT NULL,
        folder TEXT NOT NULL,
        modifiedDate INTEGER NOT NULL,
        createdDate INTEGER NOT NULL,
        preview TEXT,
        width INTEGER,
        height INTEGER
    )`;
    private static sqlCreateFull = `
    CREATE TABLE IF NOT EXISTS ${MetaDB.tFull} (
        id TEXT PRIMARY KEY,
        prompt TEXT,
        workflow TEXT,
        extra TEXT
    )`;

    private static isOpen = false;
    private static isSetup = false;
    private static sdb: BetterSqlite3;
    private static fdb: BetterSqlite3;

    private static stmtGetS: Statement<unknown[], unknown>;
    private static stmtGetF: Statement<unknown[], unknown>;
    private static stmtGetRows: Statement<unknown[], unknown>;
    private static stmtGetRowsShort: Statement<unknown[], unknown>;
    private static stmtGetAllShort: Statement<unknown[], unknown>;
    private static stmtSetS: Statement<unknown[], unknown>;
    private static stmtSetF: Statement<unknown[], unknown>;
    private static stmtDeleteS: Statement<unknown[], unknown>;
    private static stmtDeleteF: Statement<unknown[], unknown>;
    private static stmtCount: Statement<unknown[], unknown>;

    private static setup() {
        if (MetaDB.isOpen)
            return;

        const shortPath = path.join(datapath, MetaDB.fShort);
        const fullPath = path.join(datapath, MetaDB.fFull);

        if (!fileExistsSync(shortPath) || !fileExistsSync(fullPath)) {
            deleteFileSync(shortPath);
            deleteFileSync(fullPath);
        }

        MetaDB.isOpen = true;
        MetaDB.sdb = openDatabase(shortPath);
        MetaDB.fdb = openDatabase(fullPath);

        if (MetaDB.isSetup)
            return;
        MetaDB.isSetup = true;
        MetaDB.sdb.exec(MetaDB.sqlCreate);
        MetaDB.fdb.exec(MetaDB.sqlCreateFull);

        MetaDB.stmtGetS = MetaDB.sdb.prepare(`SELECT * FROM ${MetaDB.tShort} WHERE id = ?`);
        MetaDB.stmtGetF = MetaDB.fdb.prepare(`SELECT * FROM ${MetaDB.tFull} WHERE id = ?`);
        MetaDB.stmtGetRows = MetaDB.sdb.prepare(`SELECT * FROM ${MetaDB.tShort} WHERE ROWID > ? AND ROWID <= ?`);
        MetaDB.stmtGetRowsShort = MetaDB.sdb.prepare(`SELECT * FROM ${MetaDB.tShort} WHERE ROWID > ? AND ROWID <= ?`);
        MetaDB.stmtGetAllShort = MetaDB.sdb.prepare(`SELECT * FROM ${MetaDB.tShort}`);
        MetaDB.stmtSetS = MetaDB.sdb.prepare(`INSERT OR REPLACE INTO ${MetaDB.tShort} (id, file, folder, modifiedDate, createdDate, preview, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        MetaDB.stmtSetF = MetaDB.fdb.prepare(`INSERT OR REPLACE INTO ${MetaDB.tFull} (id, prompt, workflow, extra) VALUES (?, ?, ?, ?)`);
        MetaDB.stmtDeleteS = MetaDB.sdb.prepare(`DELETE FROM ${MetaDB.tShort} WHERE id = ?`);
        MetaDB.stmtDeleteF = MetaDB.fdb.prepare(`DELETE FROM ${MetaDB.tFull} WHERE id = ?`);
        MetaDB.stmtCount = MetaDB.sdb.prepare(`SELECT COUNT(*) FROM ${MetaDB.tShort}`);
    }

    static ensureColumnShort(column: string, definition: string) {
        const shortPath = path.join(datapath, MetaDB.fShort);
        if (!fileExistsSync(shortPath))
            return;

        const db = openDatabase(shortPath);
        try {
            if (!sqliteTableExists(db, MetaDB.tShort))
                return;
            const result = db.prepare(`select count(*) as count from pragma_table_info('${MetaDB.tShort}') where name = ?`).get(column) as { count: number; };
            if (!result.count) {
                console.log(`Adding column '${column} ${definition}' to the short metadata table`);
                db.prepare(`ALTER TABLE ${MetaDB.tShort} ADD ${column} ${definition}`).run();
            }
        } finally {
            db.close();
        }
    }

    static ensureColumnFull(column: string, definition: string) {
        const fullPath = path.join(datapath, MetaDB.fFull);
        if (!fileExistsSync(fullPath))
            return;

        const db = openDatabase(fullPath);
        try {
            if (!sqliteTableExists(db, MetaDB.tFull))
                return;
            const result = db.prepare(`select count(*) as count from pragma_table_info('${MetaDB.tFull}') where name = ?`).get(column) as { count: number; };
            if (!result.count) {
                console.log(`Adding column '${column} ${definition}' to the metadata database`);
                db.prepare(`ALTER TABLE ${MetaDB.tFull} ADD ${column} ${definition}`).run();
            }
        } finally {
            db.close();
        }
    }

    static updateDimensions(updates: { id: string; width: number; height: number }[]) {
        if (!updates.length)
            return;
        MetaDB.setup();
        const stmt = MetaDB.sdb.prepare(`UPDATE ${MetaDB.tShort} SET width = ?, height = ? WHERE id = ?`);
        MetaDB.sdb.transaction((items: { id: string; width: number; height: number }[]) => {
            for (const item of items) {
                stmt.run(item.width, item.height, item.id);
            }
        }).immediate(updates);
    }

    static countMissingDimensions(): number {
        MetaDB.setup();
        return Number(MetaDB.sdb.prepare(`SELECT COUNT(*) FROM ${MetaDB.tShort} WHERE width IS NULL OR height IS NULL`).pluck().get());
    }

    static getShortBatchMissingDimensions(limit: number): ServerImage[] {
        MetaDB.setup();
        return MetaDB.sdb.prepare(`SELECT * FROM ${MetaDB.tShort} WHERE width IS NULL OR height IS NULL LIMIT ?`).all(limit) as ServerImage[];
    }

    static dropTable(name: string) {
        openDatabase(path.join(datapath, MetaDB.fShort)).exec('DROP TABLE IF EXISTS ' + name).close();
        openDatabase(path.join(datapath, MetaDB.fFull)).exec('DROP TABLE IF EXISTS ' + name).close();
    }

    static close() {
        if (!MetaDB.isOpen)
            return;
        MetaDB.isOpen = false;
        MetaDB.sdb.close();
        MetaDB.fdb.close();
    }

    static get(id: string): ServerImageFull | undefined {
        MetaDB.setup();
        const main = MetaDB.stmtGetS.get(id) as ServerImageFull | undefined;
        if (!main)
            return;
        const full = MetaDB.stmtGetF.get(id) as ServerImagePartial | undefined;
        main.prompt = full!.prompt;
        main.workflow = full!.workflow;
        main.extra = full!.extra;
        return main;
    }

    static getMany(ids: string[]): ServerImageFull[] {
        MetaDB.setup();
        const results = MetaDB.sdb.prepare(`SELECT * FROM ${MetaDB.tShort} WHERE id IN('${ids.join("', '")}')`).all() as ServerImageFull[];
        const data = MetaDB.fdb.prepare(`SELECT * FROM ${MetaDB.tFull} WHERE id IN('${ids.join("', '")}')`).all() as ServerImagePartial[];
        for (let i = 0; i < results.length; i++) {
            if (!data[i]) {
                results[i] = undefined as any;
                continue;
            }
            results[i].prompt = data[i].prompt;
            results[i].workflow = data[i].workflow;
            results[i].extra = data[i].extra;
        }
        return results.filter(x => !!x);
    }

    // static getAll(): ImageListFull {
    //     MetaDB.setup();
    //     const images = MetaDB.sdb.prepare(`SELECT * FROM ${MetaDB.tShort}`).all() as ServerImageFull[];
    //     const images = MetaDB.fdb.prepare(`SELECT * FROM ${MetaDB.tFull}`).all() as ServerImagePartial[];
    //     return new Map(images.map(image => [image.id, image]));
    // }

    static * getAllLazy(batch: number) {
        MetaDB.setup();
        const amount = MetaDB.count();
        let fetched = 0;
        while (fetched < amount) {
            const res = MetaDB.stmtGetRowsShort.all(fetched, fetched + batch) as ServerImageFull[];
            const data = MetaDB.stmtGetRows.all(fetched, fetched + batch) as ServerImagePartial[];
            for (let i = 0; i < res.length; i++) {
                res[i].prompt = data[i].prompt;
                res[i].workflow = data[i].workflow;
                res[i].extra = data[i].extra;
            }
            yield res;
            fetched += batch;
        }
    }

    /** TODO: type is not accurate */
    static getAllShort(): ServerImage[] {
        MetaDB.setup();
        return MetaDB.stmtGetAllShort.all() as ServerImage[];
    }

    /** TODO: type is not accurate */
    static * getAllShortLazy(batch: number) {
        MetaDB.setup();
        const amount = MetaDB.count();
        let fetched = 0;
        while (fetched < amount) {
            yield MetaDB.stmtGetRowsShort.all(fetched, fetched + batch) as ServerImage[];
            fetched += batch;
        }
    }

    // static search(parts: (string | string[])[], startDate?: number, endDate?: number): Map<string, ServerImageFull> {
    //     MetaDB.setup();
    //     parts = parts
    //         .map(x => typeof x === 'string' ? x : x.filter(y => !!y))
    //         .filter(x => typeof x === 'string' ? !!x : x.length);

    //     const params: (string | number)[] = parts.map(x => {
    //         if (typeof x === 'string') return [`%${x}%`];
    //         if (x.length < 1) return [];
    //         if (x.length === 1) return [`%${x[0]}%`];
    //         return x.filter(y => !!y).map(y => `%${y}%`);
    //     }).filter(x => x.length).flat();

    //     const where = parts.map(x => {
    //         if (typeof x === 'string') return `prompt like ?`;
    //         if (x.length === 1) return `prompt like ?`;
    //         return `(${x.map(() => `prompt like ?`).join(' or ')})`;
    //     });

    //     if (startDate) {
    //         where.unshift(`modifiedDate >= ?`);
    //         params.unshift(startDate);
    //     }

    //     if (endDate) {
    //         where.unshift(`modifiedDate <= ?`);
    //         params.unshift(endDate);
    //     }

    //     const images = MetaDB.sdb.prepare(`SELECT * FROM ${MetaDB.tShort} WHERE ${where.join(' and ')}`).all(params) as ServerImageFull[];
    //     const images = MetaDB.fdb.prepare(`SELECT * FROM ${MetaDB.tFull} WHERE ${where.join(' and ')}`).all(params) as ServerImageFull[];
    //     return new Map(images.map(image => [image.id, image]));
    // }


    static set(image: ServerImageFull) {
        MetaDB.setup();
        MetaDB.stmtSetS.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview, image.width ?? null, image.height ?? null);
        MetaDB.stmtSetF.run(image.id, image.prompt, image.workflow, image.extra);
    }

    static setAll(images: ServerImageFull[]) {
        if (!images?.length)
            return;
        MetaDB.setup();
        MetaDB.sdb.transaction((images: ServerImageFull[]) => {
            for (const image of images) {
                MetaDB.stmtSetS.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview, image.width ?? null, image.height ?? null);
            }
        }).immediate(images);
        MetaDB.fdb.transaction((images: ServerImageFull[]) => {
            for (const image of images) {
                MetaDB.stmtSetF.run(image.id, image.prompt, image.workflow, image.extra);
            }
        }).immediate(images);
    }

    static delete(id: string) {
        MetaDB.setup();
        MetaDB.stmtDeleteS.run(id);
        MetaDB.stmtDeleteF.run(id);
    }

    static deleteAll(ids: string[]) {
        MetaDB.setup();
        MetaDB.sdb.transaction(ids => {
            for (const id of ids) {
                MetaDB.stmtDeleteS.run(id);
            }
        }).immediate(ids);
        MetaDB.fdb.transaction(ids => {
            for (const id of ids) {
                MetaDB.stmtDeleteF.run(id);
            }
        }).immediate(ids);
    }

    static setAndDeleteAll(images: ServerImageFull[], deletions: string[]) {
        MetaDB.setup();
        if (!images || !deletions)
            throw new Error('Images and deletions must be defined');
        if (images.find(image => deletions.includes(image.id)))
            throw new Error('Cannot set and delete the same image');
        if (!images.length && !deletions.length)
            return;

        MetaDB.sdb.transaction((deletions: string[], images: ServerImageFull[]) => {
            for (const id of deletions)
                MetaDB.stmtDeleteS.run(id);
            for (const image of images)
                MetaDB.stmtSetS.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview, image.width ?? null, image.height ?? null);
        }).immediate(deletions, images);

        MetaDB.fdb.transaction((deletions: string[], images: ServerImageFull[]) => {
            for (const id of deletions)
                MetaDB.stmtDeleteF.run(id);
            for (const image of images)
                MetaDB.stmtSetF.run(image.id, image.prompt, image.workflow, image.extra);
        }).immediate(deletions, images);
    }

    static clearAll() {
        MetaDB.setup();
        MetaDB.sdb.exec(`DELETE FROM ${MetaDB.tShort}`);
        MetaDB.fdb.exec(`DELETE FROM ${MetaDB.tFull}`);
    }

    static count(): number {
        MetaDB.setup();
        return Number(MetaDB.stmtCount.pluck().get());
    }

    static searchPrompt(words: string[]): Set<string> {
        MetaDB.setup();
        const terms = words.filter(w => w);
        if (!terms.length)
            return new Set();

        const params = terms.map(w => `%${w}%`);
        const where = terms.map(() => 'prompt LIKE ?').join(' AND ');
        const rows = MetaDB.fdb.prepare(`SELECT id FROM ${MetaDB.tFull} WHERE ${where}`).all(params) as { id: string }[];
        return new Set(rows.map(r => r.id));
    }
}

export class MetaCalcDB {
    private static file = 'appdata.sqlite3';
    private static table = 'extradata';
    private static stagingTable = 'extradata_staging';
    private static oldTable = 'extradata_old';
    private static sqlCreate = `
    CREATE TABLE IF NOT EXISTS ${MetaCalcDB.table} (
        id TEXT PRIMARY KEY,
        positive TEXT,
        negative TEXT,
        params TEXT,
        models TEXT,
        hash TEXT,
        annotation TEXT
    )`;
    private static sqlCreateStaging = `
    CREATE TABLE IF NOT EXISTS ${MetaCalcDB.stagingTable} (
        id TEXT PRIMARY KEY,
        positive TEXT,
        negative TEXT,
        params TEXT,
        models TEXT,
        hash TEXT,
        annotation TEXT
    )`;

    private static isOpen = false;
    private static isSetup = false;
    private static db: BetterSqlite3;

    static setup() {
        if (MetaCalcDB.isOpen)
            return;
        
        MetaCalcDB.isOpen = true;
        const fullpath = path.join(datapath, MetaCalcDB.file);
        MetaCalcDB.db = openDatabase(fullpath);

        if (MetaCalcDB.isSetup)
            return;
        MetaCalcDB.isSetup = true;
        MetaCalcDB.db.exec(MetaCalcDB.sqlCreate);
        MetaCalcDB.cleanupOrphanExtradataTables();
    }

    /** Drops leftover staging/old tables from an interrupted recalc. */
    static cleanupOrphanExtradataTables() {
        MetaCalcDB.setup();
        for (const table of [MetaCalcDB.stagingTable, MetaCalcDB.oldTable]) {
            if (sqliteTableExists(MetaCalcDB.db, table)) {
                console.warn(`Removing orphan extradata table '${table}' from interrupted recalculation`);
                MetaCalcDB.db.exec(`DROP TABLE IF EXISTS ${table}`);
            }
        }
    }

    static ensureStagingTable() {
        MetaCalcDB.setup();
        MetaCalcDB.db.exec(MetaCalcDB.sqlCreateStaging);
    }

    static clearStaging() {
        MetaCalcDB.setup();
        MetaCalcDB.ensureStagingTable();
        MetaCalcDB.db.exec(`DELETE FROM ${MetaCalcDB.stagingTable}`);
    }

    static setAllStaging(data: ImageExtraData[]) {
        MetaCalcDB.setup();
        MetaCalcDB.ensureStagingTable();
        const stmt = MetaCalcDB.db.prepare(
            `INSERT OR REPLACE INTO ${MetaCalcDB.stagingTable} (id, positive, negative, params, models, hash, annotation) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        MetaCalcDB.db.transaction((data: ImageExtraData[]) => {
            for (const item of data) {
                const existing = MetaCalcDB.get(item.id);
                const annotation = item.annotation !== undefined ? item.annotation : (existing?.annotation ?? null);
                stmt.run(item.id, item.positive, item.negative, item.params, item.models ?? '', item.hash, annotation);
            }
        }).immediate(data);
    }

    static dropStaging() {
        MetaCalcDB.setup();
        MetaCalcDB.db.exec(`DROP TABLE IF EXISTS ${MetaCalcDB.stagingTable}`);
    }

    static swapStagingToLive(validIds: Set<string>) {
        MetaCalcDB.setup();
        if (!sqliteTableExists(MetaCalcDB.db, MetaCalcDB.stagingTable))
            throw new Error('Staging table does not exist');

        MetaCalcDB.db.transaction(() => {
            MetaCalcDB.db.exec('CREATE TEMP TABLE recalc_valid_ids (id TEXT PRIMARY KEY)');
            const insertValid = MetaCalcDB.db.prepare('INSERT INTO recalc_valid_ids (id) VALUES (?)');
            const validList = [...validIds];
            for (let i = 0; i < validList.length; i += 500) {
                const batch = validList.slice(i, i + 500);
                for (const id of batch)
                    insertValid.run(id);
            }

            MetaCalcDB.db.exec(
                `DELETE FROM ${MetaCalcDB.stagingTable} WHERE id NOT IN (SELECT id FROM recalc_valid_ids)`,
            );

            MetaCalcDB.db.prepare(
                `UPDATE ${MetaCalcDB.stagingTable} SET annotation = (
                    SELECT annotation FROM ${MetaCalcDB.table} WHERE ${MetaCalcDB.table}.id = ${MetaCalcDB.stagingTable}.id
                ) WHERE id IN (SELECT id FROM ${MetaCalcDB.table})`,
            ).run();

            MetaCalcDB.db.exec(`ALTER TABLE ${MetaCalcDB.table} RENAME TO ${MetaCalcDB.oldTable}`);
            MetaCalcDB.db.exec(`ALTER TABLE ${MetaCalcDB.stagingTable} RENAME TO ${MetaCalcDB.table}`);
            MetaCalcDB.db.exec(
                `INSERT INTO ${MetaCalcDB.table} SELECT * FROM ${MetaCalcDB.oldTable} WHERE id NOT IN (SELECT id FROM ${MetaCalcDB.table})`,
            );
            MetaCalcDB.db.exec(`DROP TABLE ${MetaCalcDB.oldTable}`);
            MetaCalcDB.db.exec('DROP TABLE recalc_valid_ids');
        }).immediate();
    }

    static ensureColumn(column: string, definition: string) {
        const fullpath = path.join(datapath, MetaCalcDB.file);
        if (!fileExistsSync(fullpath))
            return;

        const db = openDatabase(fullpath);
        try {
            if (!sqliteTableExists(db, MetaCalcDB.table))
                return;
            const result = db.prepare(`select count(*) as count from pragma_table_info('${MetaCalcDB.table}') where name = ?`).get(column) as { count: number; };
            if (!result.count) {
                console.log(`Adding column '${column} ${definition}' to the extradata table`);
                db.prepare(`ALTER TABLE ${MetaCalcDB.table} ADD ${column} ${definition}`).run();
            }
        } finally {
            db.close();
        }
    }

    static close() {
        if (!MetaCalcDB.isOpen)
            return;
        MetaCalcDB.isOpen = false;
        MetaCalcDB.db.close();
    }

    static get(id: string): ImageExtraData | undefined {
        MetaCalcDB.setup();
        return MetaCalcDB.db.prepare(`SELECT * FROM ${MetaCalcDB.table} WHERE id = ?`).get(id) as ImageExtraData | undefined;
    }

    static getAll(): ImageExtraData[] {
        MetaCalcDB.setup();
        return MetaCalcDB.db.prepare(`SELECT * FROM ${MetaCalcDB.table}`).all() as ImageExtraData[];
    }

    static getAllIds(): string[] {
        MetaCalcDB.setup();
        return MetaCalcDB.db.prepare(`SELECT id FROM ${MetaCalcDB.table}`).all().map(x => (x as ImageExtraData).id) as string[];
    }

    static * getAllLazy(batch: number) {
        MetaCalcDB.setup();
        const amount = MetaDB.count();
        const stmt = MetaCalcDB.db.prepare(`SELECT * FROM ${MetaCalcDB.table} WHERE ROWID > ? AND ROWID <= ?`);
        let fetched = 0;
        while (fetched < amount) {
            yield stmt.all(fetched, fetched + batch) as ImageExtraData[];
            fetched += batch;
        }
    }

    static getIdsByHash(hash: string): string[] {
        MetaCalcDB.setup();
        return MetaCalcDB.db.prepare(`SELECT id FROM ${MetaCalcDB.table} WHERE hash = ?`).all(hash).map(x => (x as ImageExtraData).id) as string[];
    }

    static set(data: ImageExtraData) {
        MetaCalcDB.setup();
        const existing = MetaCalcDB.get(data.id);
        const annotation = data.annotation !== undefined ? data.annotation : (existing?.annotation ?? null);
        const stmt = MetaCalcDB.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params, models, hash, annotation) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        stmt.run(data.id, data.positive, data.negative, data.params, data.models ?? '', data.hash, annotation);
    }

    static setAll(data: ImageExtraData[]) {
        MetaCalcDB.setup();
        const stmt = MetaCalcDB.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params, models, hash, annotation) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        MetaCalcDB.db.transaction((data: ImageExtraData[]) => {
            for (const item of data) {
                const existing = MetaCalcDB.get(item.id);
                const annotation = item.annotation !== undefined ? item.annotation : (existing?.annotation ?? null);
                stmt.run(item.id, item.positive, item.negative, item.params, item.models ?? '', item.hash, annotation);
            }
        }).immediate(data);
    }

    static setAnnotation(id: string, annotation: string) {
        MetaCalcDB.setup();
        MetaCalcDB.db.prepare(`UPDATE ${MetaCalcDB.table} SET annotation = ? WHERE id = ?`).run(annotation, id);
    }

    static delete(id: string) {
        MetaCalcDB.setup();
        const stmt = MetaCalcDB.db.prepare(`DELETE FROM ${MetaCalcDB.table} WHERE id = ?`);
        stmt.run(id);
    }

    static deleteAll(ids: string[]) {
        MetaCalcDB.setup();
        const stmt = MetaCalcDB.db.prepare(`DELETE FROM ${MetaCalcDB.table} WHERE id = ?`);
        MetaCalcDB.db.transaction(ids => {
            for (const id of ids)
                stmt.run(id);
        }).immediate(ids);
    }

    static setAndDeleteAll(data: ImageExtraData[], deletions: string[]) {
        MetaCalcDB.setup();
        if (!data || !deletions)
            throw new Error('Images and deletions must be defined');
        if (data.find(x => deletions.includes(x.id)))
            throw new Error('Cannot set and delete the same image');
        if (!data.length && !deletions.length)
            return;
        const delstmt = MetaCalcDB.db.prepare(`DELETE FROM ${MetaCalcDB.table} WHERE id = ?`);
        const addstmt = MetaCalcDB.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params, models, hash, annotation) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        MetaCalcDB.db.transaction((data: ImageExtraData[], deletions: string[]) => {
            for (const id of deletions)
                delstmt.run(id);
            for (const item of data) {
                const existing = MetaCalcDB.get(item.id);
                const annotation = item.annotation !== undefined ? item.annotation : (existing?.annotation ?? null);
                addstmt.run(item.id, item.positive, item.negative, item.params, item.models ?? '', item.hash, annotation);
            }
        }).immediate(data, deletions);
    }

    static clearAll() {
        MetaCalcDB.setup();
        MetaCalcDB.db.exec(`DELETE FROM ${MetaCalcDB.table}`);
    }

    static count(): number {
        MetaCalcDB.setup();
        return Number(MetaCalcDB.db.prepare(`SELECT COUNT(*) FROM ${MetaCalcDB.table}`).pluck().get());
    }
}

export class MiscDB {
    private static file = 'appdata.sqlite3';
    private static sql_create = `
    CREATE TABLE IF NOT EXISTS misc (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`;

    private static isOpen = false;
    private static isSetup = false;
    private static db: BetterSqlite3;

    private static setup() {
        if (MiscDB.isOpen)
            return;

        MiscDB.isOpen = true;
        const fullpath = path.join(datapath, MiscDB.file);
        MiscDB.db = openDatabase(fullpath);

        if (MiscDB.isSetup)
            return;
        MiscDB.isSetup = true;
        MiscDB.db.exec(MiscDB.sql_create);
    }
    
    static vacuum() {
        MiscDB.setup();
        MiscDB.db.exec('VACUUM');
    }

    static close(resetSetup = false) {
        if (!MiscDB.isOpen)
            return;
        MiscDB.isOpen = false;
        if (resetSetup)
            MiscDB.isSetup = false;
        MiscDB.db.close();
    }

    static get(id: string): string | undefined {
        MiscDB.setup();
        return MiscDB.db.prepare('SELECT value FROM misc WHERE id = ?').pluck().get(id) as string | undefined;
    }

    static getAll(): Map<string, string> {
        MiscDB.setup();
        const misc = MiscDB.db.prepare('SELECT * FROM misc').all() as { id: string, value: string; }[];
        return new Map(misc.map(({ id, value }) => [id, value]));
    }

    static set(id: string, value: string) {
        MiscDB.setup();
        const stmt = MiscDB.db.prepare('INSERT OR REPLACE INTO misc (id, value) VALUES (?, ?)');
        stmt.run(id, value);
    }

    static setAll(misc: Map<string, string>) {
        MiscDB.setup();
        const stmt = MiscDB.db.prepare('INSERT OR REPLACE INTO misc (id, value) VALUES (?, ?)');
        MiscDB.db.transaction(misc => {
            for (const [id, value] of misc)
                stmt.run(id, value);
        }).immediate(misc);
    }

    static delete(id: string) {
        MiscDB.setup();
        const stmt = MiscDB.db.prepare('DELETE FROM misc WHERE id = ?');
        stmt.run(id);
    }

    static deleteAll(ids: string[]) {
        MiscDB.setup();
        const stmt = MiscDB.db.prepare('DELETE FROM misc WHERE id = ?');
        MiscDB.db.transaction(ids => {
            for (const id of ids)
                stmt.run(id);
        }).immediate(ids);
    }

    static clearAll() {
        MiscDB.setup();
        MiscDB.db.exec('DELETE FROM misc');
    }

    static count(): number {
        MiscDB.setup();
        return Number(MiscDB.db.prepare('SELECT COUNT(*) FROM misc').pluck().get());
    }
}