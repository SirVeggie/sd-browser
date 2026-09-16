import { canVectorizeImage, getEmbeddingImagePath } from '$lib/tools/misc';
import {
    NSFW_CLASSIFY_NOT_CONFIGURED_MESSAGE,
    applyClassifyTags,
    hasAssignedClassifyTags,
    labelFromScores,
    softmax,
    type NsfwClassifySettings,
} from '$lib/types/nsfwClassify';
import { getImage } from './dataIndex';
import { notifyMetadataChange } from './imageChangeHub';
import { ensureNsfwClassifyModel } from './nsfwClassifyModel';
import { readNsfwClassifySettings } from './nsfwClassifySettings';
import { MetaCalcDB } from './db';
import { nsfwClassifyWorkerPool } from './workers/nsfwClassifyWorkerPool';

const AUTO_CONCURRENCY = 2;

export class NsfwClassifyNotConfiguredError extends Error {
    constructor(message = NSFW_CLASSIFY_NOT_CONFIGURED_MESSAGE) {
        super(message);
        this.name = 'NsfwClassifyNotConfiguredError';
    }
}

export type ClassifyImageResult =
    | { status: 'applied'; label: string; tags: string[] }
    | { status: 'unchanged'; label: string; tags: string[] }
    | { status: 'skipped'; reason: 'no-image' | 'no-preview' };

const autoQueue: string[] = [];
const autoQueued = new Set<string>();
let autoInFlight = 0;

function writeImageTags(id: string, tags: string[], notify: boolean): void {
    MetaCalcDB.setTags(id, tags);
    const image = getImage(id);
    if (image)
        image.tags = tags;
    if (notify)
        notifyMetadataChange(id);
}

export async function classifyImage(
    id: string,
    options?: { settings?: NsfwClassifySettings; modelPath?: string; notify?: boolean },
): Promise<ClassifyImageResult> {
    const settings = options?.settings ?? readNsfwClassifySettings();
    if (!hasAssignedClassifyTags(settings))
        throw new NsfwClassifyNotConfiguredError();

    const image = getImage(id);
    if (!image)
        return { status: 'skipped', reason: 'no-image' };
    if (!canVectorizeImage(image))
        return { status: 'skipped', reason: 'no-preview' };

    const modelPath = options?.modelPath ?? await ensureNsfwClassifyModel();
    const scores = softmax(await nsfwClassifyWorkerPool.classify(getEmbeddingImagePath(image), modelPath));
    const label = labelFromScores(scores);
    const nextTags = applyClassifyTags(image.tags ?? [], label, settings);
    const previous = image.tags ?? [];
    const unchanged =
        previous.length === nextTags.length
        && previous.every((tag, index) => tag === nextTags[index]);
    if (!unchanged)
        writeImageTags(id, nextTags, options?.notify !== false);
    return {
        status: unchanged ? 'unchanged' : 'applied',
        label,
        tags: nextTags,
    };
}

export function scheduleAutoNsfwClassify(id: string): void {
    const settings = readNsfwClassifySettings();
    if (!settings.autoClassify || !hasAssignedClassifyTags(settings))
        return;
    if (autoQueued.has(id))
        return;
    autoQueued.add(id);
    autoQueue.push(id);
    pumpAutoClassify();
}

function pumpAutoClassify(): void {
    while (autoInFlight < AUTO_CONCURRENCY && autoQueue.length) {
        const id = autoQueue.shift();
        if (!id)
            break;
        autoInFlight++;
        void classifyImage(id, { notify: true })
            .catch((error) => {
                if (error instanceof NsfwClassifyNotConfiguredError)
                    return;
                console.error(`Auto NSFW classify failed for ${id}:`, error);
            })
            .finally(() => {
                autoQueued.delete(id);
                autoInFlight--;
                pumpAutoClassify();
            });
    }
}
