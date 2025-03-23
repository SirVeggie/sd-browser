import Database from 'better-sqlite3';
import path from "path";
import { datapath } from "./filemanager";
import fs from "fs/promises";
import { MetaCalcDB, MiscDB } from "./db";
import type { ServerImageFull } from '$lib/types/images';

const version = '1';

export async function handleLegacyStart() {
    const oldVersion = MiscDB.get('version');
    handleVersion1(oldVersion);
}

export async function handleLegacyEnd() {
    MiscDB.set('version', version);
}

async function handleVersion1(oldVersion: string | undefined) {
    if (!oldVersion) {
        fs.rename(path.join(datapath, 'data.sqlite3'), path.join(datapath, 'appdata.sqlite3'));
        fs.rename(path.join(datapath, 'metadata.sqlite3'), path.join(datapath, 'workflows.sqlite3'));
        MetaCalcDB.dropTable('extradata');

        const sdb = new Database(path.join(datapath, 'metadata.sqlite3'));
        const fdb = new Database(path.join(datapath, 'workflows.sqlite3'));
        const fetch = fdb.prepare(`SELECT * FROM metadata WHERE ROWID > ? AND ROWID <= ?`);
        const stmtSetS = sdb.prepare(`INSERT OR REPLACE INTO short (id, file, folder, modifiedDate, createdDate, preview) VALUES (?, ?, ?, ?, ?, ?)`);
        const stmtSetF = fdb.prepare(`INSERT OR REPLACE INTO full (id, prompt, workflow) VALUES (?, ?, ?)`);
        const size = 5000;
        let batch: ServerImageFull[] = undefined as any;
        let fetched = 0;

        while (batch?.length ?? true) {
            batch = fetch.all(fetched, fetched + size) as ServerImageFull[];

            sdb.transaction((images: ServerImageFull[]) => {
                for (const image of images) {
                    stmtSetS.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview);
                }
            })(batch);
            fdb.transaction((images: ServerImageFull[]) => {
                for (const image of images) {
                    stmtSetF.run(image.id, image.prompt, image.workflow);
                }
            })(batch);

            fetched += size;
        }
    }
}