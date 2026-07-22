import fs from 'fs';
import fsPromises from 'fs/promises';
import exifr from 'exifr';
import sharp from 'sharp';
import { orientedDisplaySize } from '$lib/tools/imageGeometry';
import type { ImageExtraData, ServerImageFull } from '$lib/types/images';
import { computeExtradataFromFull } from './extradataComputeCore';

/** Work unit sent to an indexing worker (or main-thread fallback). */
export type IndexingJob = {
    id: string;
    file: string;
    folder: string;
    preview: string;
    /** Sidecar metadata file (txt/yaml/json). */
    txtPath?: string;
    /** Alternate EXIF source (e.g. video companion PNG). */
    exifSource?: string;
    /** Prefer txt sidecar; fall back to EXIF when missing/empty. */
    preferTxt: boolean;
    width?: number;
    height?: number;
};

/** Result returned from an indexing worker. */
export type IndexingResult = {
    id: string;
    file: string;
    folder: string;
    modifiedDate: number;
    createdDate: number;
    preview: string;
    prompt: string;
    workflow: string;
    extra: string;
    width?: number;
    height?: number;
    positive: string;
    negative: string;
    params: string;
    models: string;
    hash: string;
    /** True when prompt/workflow/extra (or parsed fields) were found. */
    foundMetadata: boolean;
};

function isPng(file: string): boolean {
    return file.toLowerCase().endsWith('.png');
}

/** Worker-safe dimension read — avoids filetools/misc (lodash / $env) import chains. */
async function readIndexingDimensions(
    filepath: string,
    preview: string,
): Promise<{ width: number; height: number } | undefined> {
    const candidates: string[] = [];
    if (preview)
        candidates.push(preview);
    if (/\.mp4$/i.test(filepath)) {
        const companion = filepath.replace(/\.\w+$/i, '.png');
        if (companion !== preview)
            candidates.push(companion);
    } else {
        candidates.push(filepath);
    }

    for (const candidate of candidates) {
        if (!fs.existsSync(candidate))
            continue;
        try {
            const meta = await sharp(candidate, { failOn: 'truncated' }).metadata();
            if (meta.width && meta.height)
                return orientedDisplaySize(meta.width, meta.height, meta.orientation);
        } catch {
            // try next candidate
        }
    }
    return undefined;
}

async function readExifFields(
    imageFile: string,
    altSource?: string,
): Promise<{ prompt: string; workflow: string; extra: string; preview?: string }> {
    const source = altSource || imageFile;
    const validSource = isPng(imageFile) || isPng(altSource ?? '');
    if (!validSource)
        return { prompt: '', workflow: '', extra: '' };

    const metadata = await exifr.parse(source, {
        ifd0: false,
        chunked: false,
    } as any);
    if (!metadata)
        return { prompt: '', workflow: '', extra: '' };

    let prompt = metadata.parameters ?? metadata.prompt ?? '';
    const workflow = metadata.workflow ?? '';
    const extra = metadata.extra ?? '';
    if (!prompt && !workflow && !extra)
        prompt = JSON.stringify(metadata);

    return {
        prompt: typeof prompt === 'string' ? prompt : String(prompt ?? ''),
        workflow: typeof workflow === 'string' ? workflow : String(workflow ?? ''),
        extra: typeof extra === 'string' ? extra : String(extra ?? ''),
        preview: altSource || undefined,
    };
}

/**
 * Index one image: dates, dimensions, metadata (txt and/or EXIF), extradata.
 * Safe for worker threads (no DB / env / lodash).
 */
export async function processIndexingJob(job: IndexingJob): Promise<IndexingResult> {
    let modifiedDate = 0;
    let createdDate = 0;
    try {
        const stats = await fsPromises.stat(job.file);
        modifiedDate = stats.mtimeMs;
        createdDate = stats.birthtimeMs;
    } catch {
        // leave dates at 0
    }

    let width = job.width;
    let height = job.height;
    if (!width || !height) {
        const dims = await readIndexingDimensions(job.file, job.preview);
        if (dims) {
            width = dims.width;
            height = dims.height;
        }
    }

    let prompt = '';
    let workflow = '';
    let extra = '';
    let preview = job.preview;

    if (job.preferTxt && job.txtPath) {
        try {
            prompt = await fsPromises.readFile(job.txtPath, 'utf8');
        } catch {
            prompt = '';
        }
    }

    if (!prompt && !workflow) {
        try {
            const exif = await readExifFields(job.file, job.exifSource);
            prompt = exif.prompt;
            workflow = exif.workflow;
            extra = exif.extra;
            if (exif.preview)
                preview = exif.preview;
        } catch {
            // leave empty
        }
    } else if (job.exifSource && !preview) {
        preview = job.exifSource;
    }

    const full: ServerImageFull = {
        id: job.id,
        file: job.file,
        folder: job.folder,
        modifiedDate,
        createdDate,
        preview,
        prompt,
        workflow,
        extra,
        width,
        height,
    };

    const extraData: ImageExtraData = computeExtradataFromFull(full);
    const foundMetadata = Boolean(prompt || workflow || extra);

    return {
        id: job.id,
        file: job.file,
        folder: job.folder,
        modifiedDate,
        createdDate,
        preview,
        prompt,
        workflow,
        extra,
        width,
        height,
        positive: extraData.positive,
        negative: extraData.negative,
        params: extraData.params,
        models: extraData.models,
        hash: extraData.hash,
        foundMetadata,
    };
}

export async function processIndexingJobs(jobs: IndexingJob[]): Promise<IndexingResult[]> {
    const results: IndexingResult[] = [];
    for (const job of jobs)
        results.push(await processIndexingJob(job));
    return results;
}
