/**
 * Quick diagnostic for extract-models coverage gaps.
 * Usage: node scripts/analyze-models-gap.mjs [--datapath ./localData]
 */
import Database from 'better-sqlite3';
import path from 'path';
import { extractModels } from './extract-models.mjs';

const datapath = process.argv.includes('--datapath')
    ? process.argv[process.argv.indexOf('--datapath') + 1]
    : './localData';

const dbPath = path.join(datapath, 'workflows.sqlite3');
const db = new Database(dbPath, { readonly: true });

const stats = db.prepare(`
    SELECT
        (SELECT COUNT(*) FROM full) AS row_count,
        (SELECT MAX(ROWID) FROM full) AS max_rowid,
        (SELECT COUNT(*) FROM full WHERE prompt LIKE '%safetensors%') AS has_safetensors_word,
        (SELECT COUNT(*) FROM full WHERE prompt LIKE '%.safetensors%') AS has_dot_safetensors,
        (SELECT COUNT(*) FROM full WHERE prompt LIKE '%.gguf%') AS has_dot_gguf,
        (SELECT COUNT(*) FROM full WHERE ROWID > (SELECT COUNT(*) FROM full)) AS rows_above_count_rowid
`).get();

console.log('Database stats:', stats);

const fetch = db.prepare(`
    SELECT id, prompt, ROWID AS rowid
    FROM full
    WHERE prompt LIKE '%safetensors%'
    ORDER BY ROWID
`);

let scanned = 0;
let regexHits = 0;
let dotSafeNoRegex = 0;
const sampleMisses = [];

for (const row of fetch.iterate()) {
    scanned++;
    const models = extractModels(row.prompt);
    if (models.length) {
        regexHits++;
        continue;
    }
    if (row.prompt.includes('.safetensors')) {
        dotSafeNoRegex++;
        if (sampleMisses.length < 5) {
            const idx = row.prompt.indexOf('.safetensors');
            sampleMisses.push({
                id: row.id,
                rowid: row.rowid,
                snippet: row.prompt.slice(Math.max(0, idx - 80), idx + 40),
            });
        }
    }
}

console.log({
    scanned_with_safetensors_word: scanned,
    regex_would_emit: regexHits,
    has_dot_safetensors_but_no_regex: dotSafeNoRegex,
    safetensors_word_only_no_dot: scanned - regexHits - dotSafeNoRegex,
});

if (sampleMisses.length) {
    console.log('\nSample rows with .safetensors but no quoted filename match:');
    for (const s of sampleMisses) {
        console.log(`- id=${s.id} rowid=${s.rowid}`);
        console.log(`  ...${s.snippet}...`);
    }
}

db.close();
