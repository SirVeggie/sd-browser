import Database from 'better-sqlite3';
import type { Database as BetterSqlite3 } from 'better-sqlite3';
import path from 'path';
import { datapath } from './filemanager';
import type { ImageList, ServerImage } from '$lib/types/images';

export class TestDB {
    private static file = 'test.sqlite3';
    private static sqlCreate = `
    CREATE TABLE IF NOT EXISTS metadata (
        id TEXT PRIMARY KEY,
        file TEXT NOT NULL,
        folder TEXT NOT NULL,
        modifiedDate INTEGER NOT NULL,
        createdDate INTEGER NOT NULL,
        preview TEXT
    )`;

    private static isOpen = false;
    private static isSetup = false;
    private static db: BetterSqlite3;

    private static setup() {
        if (TestDB.isOpen)
            return;

        TestDB.isOpen = true;
        const fullpath = path.join(datapath, TestDB.file);
        TestDB.db = new Database(fullpath);

        if (TestDB.isSetup)
            return;
        TestDB.isSetup = true;
        TestDB.db.exec(TestDB.sqlCreate);
        TestDB.ensureColumn('preview', 'TEXT');
    }

    static ensureColumn(column: string, definition: string) {
        TestDB.setup();
        const result = TestDB.db.prepare("select count(*) as count from pragma_table_info('metadata') where name = ?").get(column) as { count: number; };
        if (!result.count) {
            console.log(`Adding column '${column} ${definition}' to the metadata database`);
            TestDB.db.prepare(`ALTER TABLE metadata ADD ${column} ${definition}`).run();
        }
    }

    static close() {
        if (!TestDB.isOpen)
            return;
        TestDB.isOpen = false;
        TestDB.db.close();
    }

    static get(id: string): ServerImage | undefined {
        TestDB.setup();
        return TestDB.db.prepare('SELECT * FROM metadata WHERE id = ?').get(id) as ServerImage | undefined;
    }
    
    static getMany(ids: string[]): ServerImage[] {
        TestDB.setup();
        return TestDB.db.prepare(`SELECT * FROM metadata WHERE id IN('${ids.join("', '")}')`).all() as ServerImage[];
    }

    static getAll(): ImageList {
        TestDB.setup();
        const images = TestDB.db.prepare('SELECT * FROM metadata').all() as ServerImage[];
        return new Map(images.map(image => [image.id, image]));
    }
    
    static* getAllLazy(batch: number) {
        TestDB.setup();
        const amount = TestDB.count();
        const stmt = TestDB.db.prepare(`SELECT * FROM metadata WHERE ROWID > ? AND ROWID <= ?`);
        let fetched = 0;
        while (fetched < amount) {
            yield stmt.all(fetched, fetched + batch) as ServerImage[];
            fetched += batch;
        }
    }

    static search(parts: (string | string[])[], startDate?: number, endDate?: number): Map<string, ServerImage> {
        TestDB.setup();
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
        const images = TestDB.db.prepare(sql).all(params) as ServerImage[];
        return new Map(images.map(image => [image.id, image]));
    }

    static set(image: ServerImage) {
        TestDB.setup();
        const stmt = TestDB.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, preview) VALUES (?, ?, ?, ?, ?, ?)');
        stmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview);
    }

    static setAll(images: ServerImage[]) {
        TestDB.setup();
        const stmt = TestDB.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, preview) VALUES (?, ?, ?, ?, ?, ?)');
        TestDB.db.transaction((images: ServerImage[]) => {
            for (const image of images)
                stmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview);
        })(images);
    }

    static delete(id: string) {
        TestDB.setup();
        TestDB.db.prepare('DELETE FROM metadata WHERE id = ?').run(id);
    }

    static deleteAll(ids: string[]) {
        TestDB.setup();
        const stmt = TestDB.db.prepare('DELETE FROM metadata WHERE id = ?');
        TestDB.db.transaction(ids => {
            for (const id of ids)
                stmt.run(id);
        })(ids);
    }

    static setAndDeleteAll(images: ServerImage[], deletions: string[]) {
        TestDB.setup();
        if (!images || !deletions)
            throw new Error('Images and deletions must be defined');
        if (images.find(image => deletions.includes(image.id)))
            throw new Error('Cannot set and delete the same image');
        if (!images.length && !deletions.length)
            return;
        const delstmt = TestDB.db.prepare('DELETE FROM metadata WHERE id = ?');
        const addstmt = TestDB.db.prepare('INSERT OR REPLACE INTO metadata (id, file, folder, modifiedDate, createdDate, preview) VALUES (?, ?, ?, ?, ?, ?)');
        TestDB.db.transaction((deletions: string[], images: ServerImage[]) => {
            for (const id of deletions)
                delstmt.run(id);
            for (const image of images)
                addstmt.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview);
        })(deletions, images);
    }

    static clearAll() {
        TestDB.setup();
        TestDB.db.exec('DELETE FROM metadata');
    }

    static count(): number {
        TestDB.setup();
        return Number(TestDB.db.prepare('SELECT COUNT(*) FROM metadata').pluck().get());
    }
}