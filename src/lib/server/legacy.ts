import Database, { type Database as DB3 } from 'better-sqlite3';
import path from "path";
import { datapath } from "./filemanager";
import fs from "fs/promises";
import { MiscDB } from "./db";
import type { ServerImageFull } from '$lib/types/images';
import { calcTimeRemaining, calcTimeSpent, print, updateLine } from '$lib/tools/misc';
import { deleteFile, fileExists } from './filetools';
import { sleep } from '$lib/tools/sleep';

const version = '1';

export async function handleLegacyStart() {
    const oldVersion = MiscDB.get('version');
    MiscDB.close(true);
    await handleVersion1(oldVersion);
}

export async function handleLegacyEnd() {
    MiscDB.set('version', version);
}

async function handleVersion1(oldVersion: string | undefined) {
    if (!oldVersion) {
        const oldData = path.join(datapath, 'data.sqlite3');
        const newData = path.join(datapath, 'appdata.sqlite3');
        const oldFull = path.join(datapath, 'metadata.sqlite3');
        const tempFull = path.join(datapath, 'metadata-temp.sqlite3');
        const newFull = path.join(datapath, 'workflows.sqlite3');
        if (!(await fileExists(oldData)))
            return;

        print(`Transferring data...`);
        const transferStart = Date.now();
        let odb: DB3 = undefined as any;
        let adb: DB3 = undefined as any;
        let sdb: DB3 = undefined as any;
        let fdb: DB3 = undefined as any;

        try {
            await fs.rename(oldData, newData);
            await fs.rename(oldFull, tempFull);
            updateLine('Transferring data: opening file access');
            odb = new Database(path.join(datapath, 'metadata-temp.sqlite3'));
            adb = new Database(path.join(datapath, 'appdata.sqlite3'));
            sdb = new Database(path.join(datapath, 'metadata.sqlite3'));
            fdb = new Database(path.join(datapath, 'workflows.sqlite3'));


            updateLine('Transferring data: deleting old data');
            adb.exec('DROP TABLE IF EXISTS extradata');
            updateLine('Transferring data: cleaning table');
            adb.exec('VACUUM');
            adb.close();
            adb = undefined as any;

            updateLine('Transferring data: creating tables');
            const sqlCreate = `
            CREATE TABLE IF NOT EXISTS short (
                id TEXT PRIMARY KEY,
                file TEXT NOT NULL,
                folder TEXT NOT NULL,
                modifiedDate INTEGER NOT NULL,
                createdDate INTEGER NOT NULL,
                preview TEXT
            )`;
            const sqlCreateFull = `
            CREATE TABLE IF NOT EXISTS full (
                id TEXT PRIMARY KEY,
                prompt TEXT,
                workflow TEXT
            )`;
            sdb.exec(sqlCreate);
            fdb.exec(sqlCreateFull);

            updateLine('Transferring data: preparing statements');
            const stmtCount = odb.prepare('SELECT COUNT(*) FROM metadata');
            const stmtFetch = odb.prepare('SELECT * FROM metadata WHERE ROWID > ? AND ROWID <= ?');
            const stmtSetS = sdb.prepare('INSERT OR REPLACE INTO short (id, file, folder, modifiedDate, createdDate, preview) VALUES (?, ?, ?, ?, ?, ?)');
            const stmtSetF = fdb.prepare('INSERT OR REPLACE INTO full (id, prompt, workflow) VALUES (?, ?, ?)');
            const size = 5000;
            let batch: ServerImageFull[] = [];
            let fetched = 0;
            let estimate = 'dunno';

            updateLine('Transferring data: counting rows');
            const total = Number(stmtCount.pluck().get());
            const start = Date.now();

            while (total) {
                updateLine(`Transferring data: ${fetched}/${total} (fetching) | estimate: ${estimate}`);
                batch = stmtFetch.all(fetched, fetched + size) as ServerImageFull[];
                if (!batch.length) break;

                updateLine(`Transferring data: ${fetched}/${total} (moving 1/2) | estimate: ${estimate}`);
                sdb.transaction((images: ServerImageFull[]) => {
                    for (const image of images) {
                        stmtSetS.run(image.id, image.file, image.folder, image.modifiedDate, image.createdDate, image.preview);
                    }
                })(batch);
                updateLine(`Transferring data: ${fetched}/${total} (moving 2/2) | estimate: ${estimate}`);
                fdb.transaction((images: ServerImageFull[]) => {
                    for (const image of images) {
                        stmtSetF.run(image.id, image.prompt, image.workflow);
                    }
                })(batch);

                fetched += size;
                estimate = calcTimeRemaining(start, fetched, total);
            }

            updateLine('Transferring data: shrinking database');
            odb.close();
            sdb.close();
            fdb.close();
            updateLine(`Transferred ${total} pieces of metadata successfully in ${calcTimeSpent(transferStart)}\n`);
        } catch (e) {
            print('\n');
            console.log(e);
            console.log('Failed to transfer data');
            odb?.close();
            adb?.close();
            sdb?.close();
            fdb?.close();
            await sleep(1000);
            await deleteFile(newData);
            await deleteFile(oldFull);
            await deleteFile(newFull);
        } finally {
            await sleep(1000);
            await deleteFile(oldData);
            await deleteFile(tempFull);
        }
    }
}