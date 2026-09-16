import { InferenceSession, Tensor } from 'onnxruntime-node';
import { encodeImageForNsfwClassify, nsfwClassifyInputSize } from './nsfwClassifyComputeCore';

export async function inferNsfwClassifyScores(
    session: InferenceSession,
    imagePath: string,
): Promise<number[]> {
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (!inputName || !outputName)
        throw new Error('NSFW classifier session is missing input or output names');

    const { width, height } = nsfwClassifyInputSize(session.inputMetadata);
    const encoded = await encodeImageForNsfwClassify(imagePath, width, height);
    const tensor = new Tensor('float32', encoded, [1, 3, height, width]);
    const results = await session.run({ [inputName]: tensor });
    const value = results[outputName];
    if (!value)
        throw new Error('NSFW classifier returned no output');
    return Array.from(value.data as Float32Array | number[]);
}
