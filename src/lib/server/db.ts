import type { ImageList, ServerImage } from '$lib/types';
import Database from 'better-sqlite3';
import type { Database as BetterSqlite3 } from 'better-sqlite3';
import path from 'path';
import { datapath, simplifyPrompt } from './filemanager';

//#region unique list
export function saveUniqueList(reverse: Map<string, string>) {
    const db = new MiscDB();
    db.set('uniqueList', [...reverse.values()].join('\n'));
    db.close();
}

export function loadUniqueList(cache: ImageList | undefined): [Set<string>, Map<string, string>] {
    if (!cache)
        return [new Set(), new Map()];
    const db = new MiscDB();
    const raw = db.get('uniqueList');
    db.close();
    if (!raw)
        return [new Set(), new Map()];
    const ids = raw.split('\n').filter(id => cache.has(id) && cache.get(id)!.prompt);
    const reverse = new Map(ids.map(id => [simplifyPrompt(cache.get(id)!.prompt!, cache.get(id)!.folder), id]));
    const set = new Set(ids);
    return [set, reverse];
}
//#endregion

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
        workflow TEXT
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
    }

    close() {
        if (this.closed)
            throw new Error('Database already closed');
        this.db.close();
        MetaDB.connections--;
    }

    get(id: string): ServerImage | undefined {
        if (this.closed)
            throw new Error('Database already closed');
        return this.db.prepare('SELECT * FROM metadata WHERE id = ?').get(id) as ServerImage | undefined;
    }

    getAll(): ImageList {
        if (this.closed)
            throw new Error('Database already closed');
        const images = this.db.prepare('SELECT * FROM metadata').all() as ServerImage[];
        return new Map(images.map(image => [image.id, image]));
    }

    set(image: ServerImage) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, prompt, workflow) VALUES (?, ?, ?, ?, ?, ?, ?)');
        stmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.prompt, image.workflow);
    }

    setAll(images: ServerImage[]) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, prompt, workflow) VALUES (?, ?, ?, ?, ?, ?, ?)');
        this.db.transaction(images => {
            for (const image of images)
                stmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.prompt, image.workflow);
        })(images);
    }

    delete(id: string) {
        if (this.closed)
            throw new Error('Database already closed');
        const stmt = this.db.prepare('DELETE FROM metadata WHERE id = ?');
        stmt.run(id);
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

    setAndDeleteAll(images: ServerImage[], deletions: string[]) {
        if (this.closed)
            throw new Error('Database already closed');
        if (!images || !deletions)
            throw new Error('Images and deletions must be defined');
        if (images.find(image => deletions.includes(image.id)))
            throw new Error('Cannot set and delete the same image');
        if (!images.length && !deletions.length)
            return;
        const delstmt = this.db.prepare('DELETE FROM metadata WHERE id = ?');
        const addstmt = this.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, prompt, workflow) VALUES (?, ?, ?, ?, ?, ?, ?)');
        this.db.transaction((deletions, images) => {
            for (const id of deletions)
                delstmt.run(id);
            for (const image of images)
                addstmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.prompt, image.workflow);
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