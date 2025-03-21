import Database from 'better-sqlite3';
import type { Database as BetterSqlite3 } from 'better-sqlite3';
import path from 'path';
import { datapath } from './filemanager';
import type { ImageExtraData, ImageList, ImageListFull, ServerImage, ServerImageFull } from '$lib/types/images';

export class MetaDB {
    private static file = 'metadata.sqlite3';
    private static sql_create = `
    CREATE TABLE IF NOT EXISTS metadata (
        id TEXT PRIMARY KEY,
        file TEXT NOT NULL,
        folder TEXT NOT NULL,
        modifiedDate INTEGER NOT NULL,
        createdDate INTEGER NOT NULL,
        prompt TEXT,
        workflow TEXT,
        preview TEXT
        )`;

    private static isOpen = false;
    private static isSetup = false;
    private static db: BetterSqlite3;

    private static setup() {
        if (MetaDB.isOpen)
            return;
        
        MetaDB.isOpen = true;
        const fullpath = path.join(datapath, MetaDB.file);
        MetaDB.db = new Database(fullpath);

        if (MetaDB.isSetup)
            return;
        MetaDB.isSetup = true;
        MetaDB.db.exec(MetaDB.sql_create);
        MetaDB.ensureColumn('preview', 'TEXT');
    }

    static ensureColumn(column: string, definition: string) {
        MetaDB.setup();
        const result = MetaDB.db.prepare("select count(*) as count from pragma_table_info('metadata') where name='preview'").get() as { count: number; };
        if (!result.count) {
            console.log(`Adding column '${column} ${definition}' to the metadata database`);
            MetaDB.db.prepare(`ALTER TABLE metadata ADD ${column} ${definition}`).run();
        }
    }

    static close() {
        if (!MetaDB.isOpen)
            return;
        MetaDB.isOpen = false;
        MetaDB.db.close();
    }

    static get(id: string): ServerImageFull | undefined {
        MetaDB.setup();
        return MetaDB.db.prepare('SELECT * FROM metadata WHERE id = ?').get(id) as ServerImageFull | undefined;
    }

    static getAll(): ImageListFull {
        MetaDB.setup();
        const images = MetaDB.db.prepare('SELECT * FROM metadata').all() as ServerImageFull[];
        return new Map(images.map(image => [image.id, image]));
    }

    static getAllShort(): ImageList {
        MetaDB.setup();
        const images = MetaDB.db.prepare('SELECT id, file, folder, modifiedDate, createdDate, preview FROM metadata').all() as ServerImage[];
        return new Map(images.map(image => [image.id, image]));
    }

    static search(parts: (string | string[])[], startDate?: number, endDate?: number): Map<string, ServerImageFull> {
        MetaDB.setup();
        parts = parts
            .map(x => typeof x === 'string' ? x : x.filter(y => !!y))
            .filter(x => typeof x === 'string' ? !!x : x.length);

        const params: (string | number)[] = parts.map(x => {
            if (typeof x === 'string') return [`%${x}%`];
            if (x.length < 1) return [];
            if (x.length === 1) return [`%${x[0]}%`];
            return x.filter(y => !!y).map(y => `%${y}%`);
        }).filter(x => x.length).flat();

        const where = parts.map(x => {
            if (typeof x === 'string') return 'prompt like ?';
            if (x.length === 1) return 'prompt like ?';
            return `(${x.map(() => 'prompt like ?').join(' or ')})`;
        });

        if (startDate) {
            where.unshift(`modifiedDate >= ?`);
            params.unshift(startDate);
        }

        if (endDate) {
            where.unshift(`modifiedDate <= ?`);
            params.unshift(endDate);
        }

        const sql = 'SELECT * FROM metadata WHERE ' + where.join(' and ');
        const images = MetaDB.db.prepare(sql).all(params) as ServerImageFull[];
        return new Map(images.map(image => [image.id, image]));
    }

    static set(image: ServerImageFull) {
        MetaDB.setup();
        const stmt = MetaDB.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, prompt, workflow, preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        stmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.prompt, image.workflow, image.preview);
    }

    static setAll(images: ServerImageFull[]) {
        MetaDB.setup();
        const stmt = MetaDB.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, prompt, workflow, preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        MetaDB.db.transaction((images: ServerImageFull[]) => {
            for (const image of images)
                stmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.prompt, image.workflow, image.preview);
        })(images);
    }

    static delete(id: string) {
        MetaDB.setup();
        MetaDB.db.prepare('DELETE FROM metadata WHERE id = ?').run(id);
    }

    static deleteAll(ids: string[]) {
        MetaDB.setup();
        const stmt = MetaDB.db.prepare('DELETE FROM metadata WHERE id = ?');
        MetaDB.db.transaction(ids => {
            for (const id of ids)
                stmt.run(id);
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
        const delstmt = MetaDB.db.prepare('DELETE FROM metadata WHERE id = ?');
        const addstmt = MetaDB.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, prompt, workflow, preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        MetaDB.db.transaction((deletions: string[], images: ServerImageFull[]) => {
            for (const id of deletions)
                delstmt.run(id);
            for (const image of images)
                addstmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.prompt, image.workflow, image.preview);
        })(deletions, images);
    }

    static clearAll() {
        MetaDB.setup();
        MetaDB.db.exec('DELETE FROM metadata');
    }

    static count(): number {
        MetaDB.setup();
        return Number(MetaDB.db.prepare('SELECT COUNT(*) FROM metadata').pluck().get());
    }
}

export class MetaCalcDB {
    private static file = 'data.sqlite3';
    private static table = 'extradata_v2';
    private static sql_create = `
    CREATE TABLE IF NOT EXISTS ${MetaCalcDB.table} (
        id TEXT PRIMARY KEY,
        positive TEXT,
        negative TEXT,
        params TEXT
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
        // Delete outdated versions
        MetaCalcDB.db.exec('DROP TABLE IF EXISTS extradata');
        MetaCalcDB.db.exec(MetaCalcDB.sql_create);
    }

    static close() {
        if (!MetaCalcDB.isOpen)
            return;
        MetaCalcDB.isOpen = false;
        MetaCalcDB.db.close();
    }

    static get(id: string): ImageExtraData | undefined {
        MetaCalcDB.setup();
        return MetaCalcDB.db.prepare(`SELECT id, positive, negative, params FROM ${MetaCalcDB.table} WHERE id = ?`).get(id) as ImageExtraData | undefined;
    }

    static getAll(): ImageExtraData[] {
        MetaCalcDB.setup();
        return MetaCalcDB.db.prepare(`SELECT id, positive, negative, params FROM ${MetaCalcDB.table}`).all() as ImageExtraData[];
    }

    static getAllIds(): string[] {
        MetaCalcDB.setup();
        return MetaCalcDB.db.prepare(`SELECT id FROM ${MetaCalcDB.table}`).all().map(x => (x as ImageExtraData).id) as string[];
    }

    static set(data: ImageExtraData) {
        MetaCalcDB.setup();
        const stmt = MetaCalcDB.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params) VALUES (?, ?, ?, ?)`);
        stmt.run(data.id, data.positive, data.negative, data.params);
    }

    static setAll(data: ImageExtraData[]) {
        MetaCalcDB.setup();
        const stmt = MetaCalcDB.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params) VALUES (?, ?, ?, ?)`);
        MetaCalcDB.db.transaction((data: ImageExtraData[]) => {
            for (const item of data)
                stmt.run(item.id, item.positive, item.negative, item.params);
        })(data);
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
        const addstmt = MetaCalcDB.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params) VALUES (?, ?, ?, ?)`);
        MetaCalcDB.db.transaction((data: ImageExtraData[], deletions: string[]) => {
            for (const id of deletions)
                delstmt.run(id);
            for (const item of data)
                addstmt.run(item.id, item.positive, item.negative, item.params);
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