import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const SAMPLE_COUNT = 1000;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptDir, '..');
const outputDir = path.join(projectRoot, 'devImages');

dotenv.config({ path: path.join(projectRoot, '.env') });

const sourceDir = process.env.IMG_FOLDER;
if (!sourceDir) {
    console.error('IMG_FOLDER is not set in .env');
    process.exit(1);
}

const sourceRoot = path.resolve(sourceDir);

function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

async function collectImages(dir, images = []) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await collectImages(fullPath, images);
            continue;
        }

        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
            images.push(fullPath);
        }
    }

    return images;
}

function flatDestinationPath(sourcePath, usedNames) {
    const baseName = path.basename(sourcePath);
    if (!usedNames.has(baseName)) {
        usedNames.add(baseName);
        return path.join(outputDir, baseName);
    }

    const ext = path.extname(baseName);
    const stem = path.basename(baseName, ext);

    let n = 2;
    while (true) {
        const candidate = `${stem}_${n}${ext}`;
        if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return path.join(outputDir, candidate);
        }
        n++;
    }
}

async function copyImage(sourcePath, usedNames) {
    const destinationPath = flatDestinationPath(sourcePath, usedNames);
    await copyFile(sourcePath, destinationPath);
}

async function main() {
    let sourceStat;
    try {
        sourceStat = await stat(sourceRoot);
    } catch {
        console.error(`Source folder does not exist: ${sourceRoot}`);
        process.exit(1);
    }

    if (!sourceStat.isDirectory()) {
        console.error(`IMG_FOLDER is not a directory: ${sourceRoot}`);
        process.exit(1);
    }

    console.log(`Scanning ${sourceRoot} for images...`);
    const allImages = await collectImages(sourceRoot);
    console.log(`Found ${allImages.length} images`);

    if (allImages.length === 0) {
        console.error('No images found to copy');
        process.exit(1);
    }

    const selected = shuffleInPlace(allImages).slice(0, Math.min(SAMPLE_COUNT, allImages.length));
    console.log(`Copying ${selected.length} random images to ${outputDir}...`);

    await mkdir(outputDir, { recursive: true });

    const usedNames = new Set();
    let copied = 0;
    for (const imagePath of selected) {
        await copyImage(imagePath, usedNames);
        copied++;
        if (copied % 100 === 0 || copied === selected.length) {
            process.stdout.write(`\rCopied ${copied}/${selected.length}`);
        }
    }

    console.log('\nDone.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
