import Database from 'better-sqlite3';
import type { Database as BetterSqlite3, Statement } from 'better-sqlite3';
import path from 'path';
import { datapath } from './filemanager';
import type { ImageExtraData, ServerImage, ServerImageFull, ServerImagePartial } from '$lib/types/images';
import { fileExistsSync } from './filetools';
import fs from 'fs';

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
        preview TEXT
    )`;
    private static sqlCreateFull = `
    CREATE TABLE IF NOT EXISTS ${MetaDB.tFull} (
        id TEXT PRIMARY KEY,
        prompt TEXT,
        workflow TEXT
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
            try {
                fs.unlinkSync(shortPath);
                fs.unlinkSync(fullPath);
            } catch { '' }
        }

        MetaDB.isOpen = true;
        MetaDB.sdb = new Database(shortPath);
        MetaDB.fdb = new Database(fullPath);

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
        MetaDB.stmtSetS = MetaDB.sdb.prepare(`INSERT OR REPLACE INTO ${MetaDB.tShort} (id, file, folder, modifiedDate, createdDate, preview) VALUES (?, ?, ?, ?, ?, ?)`);
        MetaDB.stmtSetF = MetaDB.fdb.prepare(`INSERT OR REPLACE INTO ${MetaDB.tFull} (id, prompt, workflow) VALUES (?, ?, ?)`);
        MetaDB.stmtDeleteS = MetaDB.sdb.prepare(`DELETE FROM ${MetaDB.tShort} WHERE id = ?`);
        MetaDB.stmtDeleteF = MetaDB.fdb.prepare(`DELETE FROM ${MetaDB.tFull} WHERE id = ?`);
        MetaDB.stmtCount = MetaDB.sdb.prepare(`SELECT COUNT(*) FROM ${MetaDB.tShort}`);
    }

    // static ensureColumn(column: string, definition: string) {
    //     MetaDB.setup();
    //     const result = MetaDB.db.prepare("select count(*) as count from pragma_table_info('metadata') where name = ?").get(column) as { count: number; };
    //     if (!result.count) {
    //         console.log(`Adding column '${column} ${definition}' to the metadata database`);
    //         MetaDB.db.prepare(`ALTER TABLE ${MetaDB.tShort} ADD ${column} ${definition}`).run();
    //     }
    // }
    
    static dropTable(name: string) {
        new Database(path.join(datapath, MetaDB.fShort)).exec('DROP TABLE IF EXISTS ' + name).close();
        new Database(path.join(datapath, MetaDB.fFull)).exec('DROP TABLE IF EXISTS ' + name).close();
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
        return main;
    }

    static getMany(ids: string[]): ServerImageFull[] {
        MetaDB.setup();
        const results = MetaDB.sdb.prepare(`SELECT * FROM ${MetaDB.tShort} WHERE id IN('${ids.join("', '")}')`).all() as ServerImageFull[];
        const data = MetaDB.fdb.prepare(`SELECT * FROM ${MetaDB.tFull} WHERE id IN('${ids.join("', '")}')`).all() as ServerImagePartial[];
        for (let i = 0; i < results.length; i++) {
            results[i].prompt = data[i].prompt;
            results[i].workflow = data[i].workflow;
        }
        return results;
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
        MetaDB.stmtSetS.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview);
        MetaDB.stmtSetF.run(image.id, image.prompt, image.workflow);
    }

    static setAll(images: ServerImageFull[]) {
        if (!images?.length)
            return;
        MetaDB.setup();
        MetaDB.sdb.transaction((images: ServerImageFull[]) => {
            for (const image of images) {
                MetaDB.stmtSetS.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview);
            }
        })(images);
        MetaDB.fdb.transaction((images: ServerImageFull[]) => {
            for (const image of images) {
                MetaDB.stmtSetF.run(image.id, image.prompt, image.workflow);
            }
        })(images);
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
        })(ids);
        MetaDB.fdb.transaction(ids => {
            for (const id of ids) {
                MetaDB.stmtDeleteF.run(id);
            }
        })(ids);
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
                MetaDB.stmtSetS.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview);
        })(deletions, images);

        MetaDB.fdb.transaction((deletions: string[], images: ServerImageFull[]) => {
            for (const id of deletions)
                MetaDB.stmtDeleteF.run(id);
            for (const image of images)
                MetaDB.stmtSetF.run(image.id, image.prompt, image.workflow);
        })(deletions, images);
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
}

export class MetaCalcDB {
    private static file = 'appdata.sqlite3';
    private static table = 'extradata';
    private static sqlCreate = `
    CREATE TABLE IF NOT EXISTS ${MetaCalcDB.table} (
        id TEXT PRIMARY KEY,
        positive TEXT,
        negative TEXT,
        params TEXT,
        hash TEXT,
        isUnique INTEGER
    )`;

    private static isOpen = false;
    private static isSetup = false;
    private static db: BetterSqlite3;

    static setup() {
        if (MetaCalcDB.isOpen)
            return;

        MetaCalcDB.isOpen = true;
        const fullpath = path.join(datapath, MetaCalcDB.file);
        MetaCalcDB.db = new Database(fullpath);
        
        if (MetaCalcDB.isSetup)
            return;
        MetaCalcDB.isSetup = true;
        MetaCalcDB.db.exec(MetaCalcDB.sqlCreate);
    }
    
    static dropTable(name: string) {
        new Database(path.join(datapath, MetaCalcDB.file)).exec('DROP TABLE IF EXISTS ' + name).close();
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
        const stmt = MetaCalcDB.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params, hash, isUnique) VALUES (?, ?, ?, ?, ?, ?)`);
        stmt.run(data.id, data.positive, data.negative, data.params, data.hash, data.isUnique);
    }

    static setAll(data: ImageExtraData[]) {
        MetaCalcDB.setup();
        const stmt = MetaCalcDB.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params, hash, isUnique) VALUES (?, ?, ?, ?, ?, ?)`);
        MetaCalcDB.db.transaction((data: ImageExtraData[]) => {
            for (const item of data)
                stmt.run(item.id, item.positive, item.negative, item.params, item.hash, item.isUnique);
        })(data);
    }

    static setUnique(id: string, state: boolean) {
        MetaCalcDB.setup();
        const stmt = MetaCalcDB.db.prepare(`UPDATE ${MetaCalcDB.table} SET isUnique = ? WHERE id = ?`);
        stmt.run(state ? 1 : 0, id);
    }

    static setAllUnique(ids: string[], state: boolean) {
        MetaCalcDB.setup();
        const stmt = MetaCalcDB.db.prepare(`UPDATE ${MetaCalcDB.table} SET isUnique = ${state ? 1 : 0} WHERE id = ?`);
        MetaCalcDB.db.transaction((ids: string[]) => {
            for (const id of ids) {
                stmt.run(id);
            }
        })(ids);
    }

    static clearUniques(onlyUnkowns = false) {
        MetaCalcDB.setup();
        MetaCalcDB.db.prepare(`UPDATE ${MetaCalcDB.table} SET isUnique = 0 WHERE isUnique = -1${(onlyUnkowns ? '' : ' OR isUnique = 1')}`).run();
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
        })(ids);
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
        const addstmt = MetaCalcDB.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params, hash, isUnique) VALUES (?, ?, ?, ?, ?, ?)`);
        MetaCalcDB.db.transaction((data: ImageExtraData[], deletions: string[]) => {
            for (const id of deletions)
                delstmt.run(id);
            for (const item of data)
                addstmt.run(item.id, item.positive, item.negative, item.params, item.hash, item.isUnique);
        })(data, deletions);
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
    private static file = 'data.sqlite3';
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
        MiscDB.db = new Database(fullpath);

        if (MiscDB.isSetup)
            return;
        MiscDB.isSetup = true;
        MiscDB.db.exec(MiscDB.sql_create);
    }

    static close() {
        if (!MiscDB.isOpen)
            return;
        MiscDB.isOpen = false;
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
        })(misc);
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
        })(ids);
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