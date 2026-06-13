/**
 * One-off extractor: scans workflows.sqlite3 and writes model filenames to NDJSON.
 *
 * Usage:
 *   node scripts/extract-models.mjs
 *   node scripts/extract-models.mjs --datapath ./localData --output ./localData/image-models.ndjson
 *   node scripts/extract-models.mjs --batch 1000 --resume
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const DEFAULT_DATAPATH = './localData';
const DEFAULT_OUTPUT = 'image-models.ndjson';
const DEFAULT_BATCH = 1000;
const TABLE = 'full';

// Match a JSON string literal whose value ends in .safetensors or .gguf.
// Boundaries are double quotes; content may include whitespace and escaped chars.
const QUOTED_MODEL_RE = /"((?:[^"\\]|\\.)*\.(?:safetensors|gguf))"/gi;

function parseArgs(argv) {
    const options = {
        datapath: DEFAULT_DATAPATH,
        output: undefined,
        batch: DEFAULT_BATCH,
        resume: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--datapath') {
            options.datapath = argv[++i];
        } else if (arg === '--output') {
            options.output = argv[++i];
        } else if (arg === '--batch') {
            options.batch = Number(argv[++i]);
        } else if (arg === '--resume') {
            options.resume = true;
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        } else {
            console.error(`Unknown argument: ${arg}`);
            printHelp();
            process.exit(1);
        }
    }

    if (!options.output) {
        options.output = path.join(options.datapath, DEFAULT_OUTPUT);
    }

    if (!Number.isFinite(options.batch) || options.batch < 1) {
        throw new Error('--batch must be a positive integer');
    }

    return options;
}

function printHelp() {
    console.log(`Usage: node scripts/extract-models.mjs [options]

Options:
  --datapath <dir>   Data directory (default: ${DEFAULT_DATAPATH})
  --output <file>    NDJSON output path (default: <datapath>/${DEFAULT_OUTPUT})
  --batch <n>        ROWID batch size (default: ${DEFAULT_BATCH})
  --resume           Continue from checkpoint file (<output>.checkpoint)
  -h, --help         Show this help
`);
}

/**
 * @param {string} prompt
 * @returns {string[]}
 */
export function extractModels(prompt) {
    if (!prompt) {
        return [];
    }

    const seen = new Set();
    for (const match of prompt.matchAll(QUOTED_MODEL_RE)) {
        let value;
        try {
            value = JSON.parse(match[0]);
        } catch {
            value = match[1];
        }
        if (typeof value === 'string' && value.length) {
            seen.add(value);
        }
    }
    return [...seen];
}

function checkpointPath(outputPath) {
    return `${outputPath}.checkpoint`;
}

function readCheckpoint(outputPath) {
    const file = checkpointPath(outputPath);
    if (!fs.existsSync(file)) {
        return 0;
    }
    const raw = fs.readFileSync(file, 'utf8').trim();
    const rowid = Number(raw);
    return Number.isFinite(rowid) && rowid >= 0 ? rowid : 0;
}

function writeCheckpoint(outputPath, rowid) {
    fs.writeFileSync(checkpointPath(outputPath), String(rowid));
}

function updateLine(str) {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(str);
}

function calcTimeString(ms) {
    ms = Math.round(ms);
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms / 1000) % 60);
    let res = minutes ? `${minutes}m` : '';
    res += seconds ? `${res ? ' ' : ''}${seconds}s` : '';
    return res || `${ms}ms`;
}

function calcTimeRemaining(start, current, total) {
    if (!current) {
        return '...';
    }
    const elapsed = Date.now() - start;
    const remaining = (total / current) * elapsed - elapsed;
    return calcTimeString(Math.max(0, remaining));
}

function openDatabase(dbPath) {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('journal_mode = OFF');
    db.pragma('synchronous = OFF');
    db.pragma('cache_size = -200000');
    db.pragma('temp_store = MEMORY');
    db.pragma('mmap_size = 30000000000');
    return db;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const dbPath = path.join(options.datapath, 'workflows.sqlite3');

    if (!fs.existsSync(dbPath)) {
        console.error(`Database not found: ${dbPath}`);
        process.exit(1);
    }

    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });

    let startRowid = 0;
    if (options.resume) {
        startRowid = readCheckpoint(options.output);
    } else if (fs.existsSync(options.output)) {
        console.error(`Output already exists: ${options.output}`);
        console.error('Use --resume to append from checkpoint, or delete the file first.');
        process.exit(1);
    }

    const db = openDatabase(dbPath);
    const rowCount = Number(db.prepare(`SELECT COUNT(*) FROM ${TABLE}`).pluck().get());
    const maxRowid = Number(db.prepare(`SELECT MAX(ROWID) FROM ${TABLE}`).pluck().get());
    const fetchStmt = db.prepare(`
        SELECT id, prompt, ROWID AS _rowid
        FROM ${TABLE}
        WHERE ROWID > ?
          AND (prompt LIKE '%.safetensors%' OR prompt LIKE '%.gguf%')
        ORDER BY ROWID
        LIMIT ?
    `);

    const out = fs.createWriteStream(options.output, {
        flags: startRowid > 0 ? 'a' : 'w',
        encoding: 'utf8',
    });

    let lastRowid = startRowid;
    let scanned = 0;
    let written = 0;
    const start = Date.now();

    console.log(`Scanning ${dbPath} (${rowCount} rows, max ROWID ${maxRowid})`);
    console.log(`Writing ${options.output}`);
    if (startRowid > 0) {
        console.log(`Resuming after ROWID ${startRowid}`);
    }

    while (lastRowid < maxRowid) {
        const rows = fetchStmt.all(lastRowid, options.batch);
        if (!rows.length) {
            break;
        }

        for (const row of rows) {
            scanned++;
            const models = extractModels(row.prompt);
            if (!models.length) {
                continue;
            }
            out.write(`${JSON.stringify({ id: row.id, models })}\n`);
            written++;
        }

        lastRowid = rows[rows.length - 1]._rowid;
        writeCheckpoint(options.output, lastRowid);

        const pct = ((lastRowid / maxRowid) * 100).toFixed(1);
        const eta = calcTimeRemaining(start, lastRowid - startRowid, maxRowid - startRowid);
        updateLine(
            `Progress: ROWID ${lastRowid}/${maxRowid} (${pct}%) | scanned: ${scanned} | written: ${written} | ETA: ${eta}`
        );
    }

    out.end();
    db.close();

    updateLine('');
    console.log(`Done in ${calcTimeString(Date.now() - start)}`);
    console.log(`Scanned ${scanned} candidate rows, wrote ${written} NDJSON lines to ${options.output}`);
    if (written < rowCount) {
        console.log(
            'Note: output lines can be fewer than total rows when prompts mention model files '
            + 'without double-quoted filenames (e.g. A1111 "VAE: foo.safetensors").'
        );
    }
    fs.unlinkSync(checkpointPath(options.output));
}

const isMain = process.argv[1]
    && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    main();
}
