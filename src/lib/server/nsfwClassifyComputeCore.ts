import sharp from 'sharp';

const TRUSTED_IMAGE_INPUT: sharp.SharpOptions = { failOn: 'truncated' };

export function nsfwClassifyInputSize(
    metadata: readonly { isTensor?: boolean; shape?: readonly (number | string)[] }[] | undefined,
): { width: number; height: number } {
    const meta = metadata?.[0];
    const shape = meta && meta.isTensor !== false ? meta.shape : undefined;
    const height = typeof shape?.[2] === 'number' && shape[2] > 0 ? shape[2] : 384;
    const width = typeof shape?.[3] === 'number' && shape[3] > 0 ? shape[3] : 384;
    return { width, height };
}

export async function encodeImageForNsfwClassify(
    imagePath: string,
    width: number,
    height: number,
): Promise<Float32Array> {
    const { data, info } = await sharp(imagePath, TRUSTED_IMAGE_INPUT)
        .rotate()
        .resize(width, height, { fit: 'fill', kernel: sharp.kernel.linear })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    if (info.channels < 3)
        throw new Error('Classifier input must be RGB');

    const plane = width * height;
    const out = new Float32Array(3 * plane);
    const stride = info.channels;
    for (let i = 0; i < plane; i++) {
        const offset = i * stride;
        out[i] = (data[offset]! / 255 - 0.5) / 0.5;
        out[plane + i] = (data[offset + 1]! / 255 - 0.5) / 0.5;
        out[2 * plane + i] = (data[offset + 2]! / 255 - 0.5) / 0.5;
    }
    return out;
}
