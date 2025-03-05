import path from "path";
import { datapath } from "./filemanager";
import fs from "fs/promises";

export async function handleLegacy() {
    await renameLegacyFile();
}

async function renameLegacyFile() {
    try {
        const cachefile = path.join(datapath, 'metadata.json');
        if ((await fs.stat(cachefile)).isFile()) {
            const newfile = path.join(datapath, 'metadata-deprecated-delete-this.json');
            await fs.rename(cachefile, newfile).catch(console.log);
            console.log('\nDELETE OLD METADATA JSON - old json file has been preserved just in case, you can delete it to save space\n');
        }
    } catch { undefined; }
}