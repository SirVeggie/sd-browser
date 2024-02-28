import { getImage } from '$lib/server/filemanager.js';
import { error, success } from '$lib/server/responses.js';
import type { ImageInfo } from '$lib/types.js';
import util from 'util';
import { exec } from 'child_process'

const promisifiedExec = util.promisify(exec);

async function runPythonScript(path: string): Promise<string> {
    try {
        const { stdout, stderr } = await promisifiedExec(`python ${'src/lib/server/stealth_pnginfo.py'} "${path}" ${'read'}`);
        return stdout
    } catch (error) {
        console.error('Error:', error);
    }
    return ''
}

export async function GET(e) {
    const src = e.params.src;
    const image = getImage(src);
    if (!image)
        return error('Image not found', 404);

    let prompt = ''
    prompt = await runPythonScript(image.file)
    return success({
        id: src,
        folder: image.folder,
        modifiedDate: image.modifiedDate,
        createdDate: image.createdDate,
        prompt: prompt,
        workflow: image.workflow,
    } satisfies ImageInfo);
}