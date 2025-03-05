import Database from 'better-sqlite3';
import type { Database as BetterSqlite3 } from 'better-sqlite3';
import path from 'path';
import { datapath } from './filemanager';
import type { ImageExtraData, ImageList, ImageListFull, ServerImage, ServerImageFull } from '$lib/types/images';

export class MetaDB {
    private static setup = false;
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

    static connections = 0;

    private db: BetterSqlite3;
    private closed = false;

    constructor() {
        if (MetaDB.connections > 0)
            throw new Error('Database already open');
        MetaDB.connections++;
        const fullpath = path.join(datapath, MetaDB.file);
        this.db = new Database(fullpath);
        this.db.exec(MetaDB.sql_create);
        
        if (!MetaDB.setup) {
            MetaDB.setup = true;
            this.ensureColumn('preview', 'TEXT');
        }
    }
    
    ensureColumn(column: string, definition: string) {
        const result = this.db.prepare("select count(*) as count from pragma_table_info('metadata') where name='preview'").get() as { count: number; };
        if (!result.count) {
            console.log(`Adding column '${column} ${definition}' to the metadata database`);
            this.db.prepare(`ALTER TABLE metadata ADD ${column} ${definition}`).run();
        }
    }

    close() {
        if (this.closed)
            throw new Error('Database already closed');
        this.db.close();
        MetaDB.connections--;
    }

    get(id: string): ServerImageFull | undefined {
        if (this.closed)
            throw new Error('Database already closed');
        return this.db.prepare('SELECT * FROM metadata WHERE id = ?').get(id) as ServerImageFull | undefined;
    }

    getAll(): ImageListFull {
        if (this.closed)
            throw new Error('Database already closed');
        const images = this.db.prepare('SELECT * FROM metadata').all() as ServerImageFull[];
        return new Map(images.map(image => [image.id, image]));
    }
    
    getAllShort(): ImageList {
        if (this.closed)
            throw new Error('Database already closed');
        const images = this.db.prepare('SELECT id, file, folder, modifiedDate, createdDate, preview FROM metadata').all() as ServerImage[];
        return new Map(images.map(image => [image.id, image]));
    }

    search(parts: (string | string[])[], startDate?: number, endDate?: number): Map<string, ServerImageFull> {
        if (this.closed)
            throw new Error('Database already closed');
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
        const images = this.db.prepare(sql).all(params) as ServerImageFull[];
        return new Map(images.map(image => [image.id, image]));
    }

    set(image: ServerImageFull) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, prompt, workflow, preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        stmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.prompt, image.workflow, image.preview);
    }

    setAll(images: ServerImageFull[]) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, prompt, workflow, preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        this.db.transaction((images: ServerImageFull[]) => {
            for (const image of images)
                stmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.prompt, image.workflow, image.preview);
        })(images);
    }

    delete(id: string) {
        if (this.closed)
            throw new Error('Database already closed');
        this.db.prepare('DELETE FROM metadata WHERE id = ?').run(id);
    }

    deleteAll(ids: string[]) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare('DELETE FROM metadata WHERE id = ?');
        this.db.transaction(ids => {
            for (const id of ids)
                stmt.run(id);
        })(ids);
    }

    setAndDeleteAll(images: ServerImageFull[], deletions: string[]) {
        if (this.closed)
            throw new Error('Database already closed');
        if (!images || !deletions)
            throw new Error('Images and deletions must be defined');
        if (images.find(image => deletions.includes(image.id)))
            throw new Error('Cannot set and delete the same image');
        if (!images.length && !deletions.length)
            return;
        const delstmt = this.db.prepare('DELETE FROM metadata WHERE id = ?');
        const addstmt = this.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, prompt, workflow, preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        this.db.transaction((deletions: string[], images: ServerImageFull[]) => {
            for (const id of deletions)
                delstmt.run(id);
            for (const image of images)
                addstmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.prompt, image.workflow, image.preview);
        })(deletions, images);
    }

    clearAll() {
        if (this.closed)
            throw new Error('Database already closed');
        this.db.exec('DELETE FROM metadata');
    }

    count(): number {
        if (this.closed)
            throw new Error('Database already closed');
        return Number(this.db.prepare('SELECT COUNT(*) FROM metadata').pluck().get());
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

    static connections = 0;

    private db: BetterSqlite3;
    private closed = false;

    constructor() {
        if (MetaDB.connections > 0)
            throw new Error('Database already open');
        MetaDB.connections++;
        const fullpath = path.join(datapath, MetaCalcDB.file);
        this.db = new Database(fullpath);
        this.db.exec(MetaCalcDB.sql_create);
        
        // Delete outdated versions
        this.db.exec('DROP TABLE IF EXISTS extradata');
    }

    close() {
        if (this.closed)
            throw new Error('Database already closed');
        this.db.close();
        MetaDB.connections--;
    }

    get(id: string): ImageExtraData | undefined {
        if (this.closed)
            throw new Error('Database already closed');
        return this.db.prepare(`SELECT id, positive, negative, params FROM ${MetaCalcDB.table} WHERE id = ?`).get(id) as ImageExtraData | undefined;
    }

    getAll(): ImageExtraData[] {
        if (this.closed)
            throw new Error('Database already closed');
        return this.db.prepare(`SELECT id, positive, negative, params FROM ${MetaCalcDB.table}`).all() as ImageExtraData[];
    }

    getAllIds(): string[] {
        if (this.closed)
            throw new Error('Database already closed');
        return this.db.prepare(`SELECT id FROM ${MetaCalcDB.table}`).all().map(x => (x as ImageExtraData).id) as string[];
    }

    set(data: ImageExtraData) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params) VALUES (?, ?, ?, ?)`);
        stmt.run(data.id, data.positive, data.negative, data.params);
    }

    setAll(data: ImageExtraData[]) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params) VALUES (?, ?, ?, ?)`);
        this.db.transaction((data: ImageExtraData[]) => {
            for (const item of data)
                stmt.run(item.id, item.positive, item.negative, item.params);
        })(data);
    }

    delete(id: string) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare(`DELETE FROM ${MetaCalcDB.table} WHERE id = ?`);
        stmt.run(id);
    }

    deleteAll(ids: string[]) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare(`DELETE FROM ${MetaCalcDB.table} WHERE id = ?`);
        this.db.transaction(ids => {
            for (const id of ids)
                stmt.run(id);
        })(ids);
    }

    setAndDeleteAll(data: ImageExtraData[], deletions: string[]) {
        if (this.closed)
            throw new Error('Database already closed');
        if (!data || !deletions)
            throw new Error('Images and deletions must be defined');
        if (data.find(x => deletions.includes(x.id)))
            throw new Error('Cannot set and delete the same image');
        if (!data.length && !deletions.length)
            return;
        const delstmt = this.db.prepare(`DELETE FROM ${MetaCalcDB.table} WHERE id = ?`);
        const addstmt = this.db.prepare(`INSERT OR REPLACE INTO ${MetaCalcDB.table} (id, positive, negative, params) VALUES (?, ?, ?, ?)`);
        this.db.transaction((data: ImageExtraData[], deletions: string[]) => {
            for (const id of deletions)
                delstmt.run(id);
            for (const item of data)
                addstmt.run(item.id, item.positive, item.negative, item.params);
        })(data, deletions);
    }

    clearAll() {
        if (this.closed)
            throw new Error('Database already closed');
        this.db.exec(`DELETE FROM ${MetaCalcDB.table}`);
    }

    count(): number {
        if (this.closed)
            throw new Error('Database already closed');
        return Number(this.db.prepare(`SELECT COUNT(*) FROM ${MetaCalcDB.table}`).pluck().get());
    }
}

export class MiscDB {
    private static file = 'data.sqlite3';
    private static sql_create = `
    CREATE TABLE IF NOT EXISTS misc (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`;

    static connections = 0;

    private db: BetterSqlite3;
    private closed = false;

    constructor() {
        if (MiscDB.connections > 0)
            throw new Error('Database already open');
        MiscDB.connections++;
        const fullpath = path.join(datapath, MiscDB.file);
        this.db = new Database(fullpath);
        this.db.exec(MiscDB.sql_create);
    }

    close() {
        if (this.closed)
            throw new Error('Database already closed');
        this.db.close();
        MiscDB.connections--;
    }

    get(id: string): string | undefined {
        if (this.closed)
            throw new Error('Database already closed');
        return this.db.prepare('SELECT value FROM misc WHERE id = ?').pluck().get(id) as string | undefined;
    }

    getAll(): Map<string, string> {
        if (this.closed)
            throw new Error('Database already closed');
        const misc = this.db.prepare('SELECT * FROM misc').all() as { id: string, value: string; }[];
        return new Map(misc.map(({ id, value }) => [id, value]));
    }

    set(id: string, value: string) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare('INSERT OR REPLACE INTO misc (id, value) VALUES (?, ?)');
        stmt.run(id, value);
    }

    setAll(misc: Map<string, string>) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare('INSERT OR REPLACE INTO misc (id, value) VALUES (?, ?)');
        this.db.transaction(misc => {
            for (const [id, value] of misc)
                stmt.run(id, value);
        })(misc);
    }

    delete(id: string) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare('DELETE FROM misc WHERE id = ?');
        stmt.run(id);
    }

    deleteAll(ids: string[]) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare('DELETE FROM misc WHERE id = ?');
        this.db.transaction(ids => {
            for (const id of ids)
                stmt.run(id);
        })(ids);
    }

    clearAll() {
        if (this.closed)
            throw new Error('Database already closed');
        this.db.exec('DELETE FROM misc');
    }

    count(): number {
        if (this.closed)
            throw new Error('Database already closed');
        return Number(this.db.prepare('SELECT COUNT(*) FROM misc').pluck().get());
    }
}