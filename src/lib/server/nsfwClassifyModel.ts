import fs from 'fs/promises';
import path from 'path';
import { datapath } from './paths';
import { fileExists } from './filetools';

export const NSFW_CLASSIFY_MODEL_NAME = 'mobilenetv3_large_100_v0_ls0.2';
export const NSFW_CLASSIFY_MODEL_REPO = 'deepghs/anime_dbrating';

const MODEL_URL =
    `https://huggingface.co/${NSFW_CLASSIFY_MODEL_REPO}/resolve/main/${NSFW_CLASSIFY_MODEL_NAME}/model.onnx`;

let ensurePromise: Promise<string> | undefined;

export function nsfwClassifyModelPath(): string {
    return path.join(datapath, 'models', NSFW_CLASSIFY_MODEL_REPO, NSFW_CLASSIFY_MODEL_NAME, 'model.onnx');
}

export async function ensureNsfwClassifyModel(): Promise<string> {
    if (!ensurePromise)
        ensurePromise = downloadNsfwClassifyModel().finally(() => {
            ensurePromise = undefined;
        });
    return ensurePromise;
}

async function downloadNsfwClassifyModel(): Promise<string> {
    const dest = nsfwClassifyModelPath();
    if (await fileExists(dest))
        return dest;

    await fs.mkdir(path.dirname(dest), { recursive: true });
    const temp = `${dest}.partial`;

    const response = await fetch(MODEL_URL, {
        headers: {
            'User-Agent': 'sd-browser',
        },
    });
    if (!response.ok || !response.body)
        throw new Error(`Failed to download NSFW classifier (${response.status} ${response.statusText})`);

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1_000_000)
        throw new Error('Downloaded NSFW classifier was unexpectedly small');

    await fs.writeFile(temp, bytes);
    await fs.rename(temp, dest);
    console.log(`Downloaded NSFW classifier to ${dest}`);
    return dest;
}
