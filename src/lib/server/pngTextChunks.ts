import fs from 'node:fs/promises';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type PngTextChunks = Record<string, string>;

function findNull(data: Buffer, start: number): number {
    const index = data.indexOf(0, start);
    return index < 0 ? data.length : index;
}

function parseTextChunk(type: string, data: Buffer): { key: string; value: string } | undefined {
    if (type === 'tEXt') {
        const sep = findNull(data, 0);
        if (sep <= 0 || sep >= data.length)
            return undefined;
        return {
            key: data.toString('latin1', 0, sep),
            value: data.toString('latin1', sep + 1),
        };
    }

    if (type === 'zTXt') {
        const sep = findNull(data, 0);
        if (sep <= 0 || sep + 1 >= data.length)
            return undefined;
        const compressionMethod = data[sep + 1];
        if (compressionMethod !== 0)
            return undefined;
        try {
            return {
                key: data.toString('latin1', 0, sep),
                value: zlib.inflateSync(data.subarray(sep + 2)).toString('latin1'),
            };
        } catch {
            return undefined;
        }
    }

    if (type === 'iTXt') {
        // keyword\0 compressionFlag compressionMethod language\0 translatedKeyword\0 text
        const keyEnd = findNull(data, 0);
        if (keyEnd <= 0 || keyEnd + 2 >= data.length)
            return undefined;
        const compressionFlag = data[keyEnd + 1];
        const compressionMethod = data[keyEnd + 2];
        const langEnd = findNull(data, keyEnd + 3);
        const translatedEnd = findNull(data, langEnd + 1);
        if (translatedEnd > data.length)
            return undefined;
        const textBytes = data.subarray(translatedEnd + 1);
        const key = data.toString('latin1', 0, keyEnd);
        try {
            if (compressionFlag === 0) {
                return { key, value: textBytes.toString('utf8') };
            }
            if (compressionFlag === 1 && compressionMethod === 0) {
                return { key, value: zlib.inflateSync(textBytes).toString('utf8') };
            }
        } catch {
            return undefined;
        }
    }

    return undefined;
}

/** Parse tEXt / iTXt / zTXt key-value pairs from a PNG buffer (CRC ignored). */
export function parsePngTextChunks(buffer: Buffer): PngTextChunks {
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE))
        return {};

    const result: PngTextChunks = {};
    let offset = 8;

    while (offset + 8 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd + 4 > buffer.length)
            break;

        if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
            const parsed = parseTextChunk(type, buffer.subarray(dataStart, dataEnd));
            if (parsed?.key)
                result[parsed.key] = parsed.value;
        }

        if (type === 'IEND')
            break;
        offset = dataEnd + 4;
    }

    return result;
}

/** Scan a PNG file for text chunks without loading IDAT payloads into strings. */
export async function readPngTextChunks(filePath: string): Promise<PngTextChunks> {
    const handle = await fs.open(filePath, 'r');
    try {
        const signature = Buffer.alloc(8);
        const sigRead = await handle.read(signature, 0, 8, 0);
        if (sigRead.bytesRead < 8 || !signature.equals(PNG_SIGNATURE))
            return {};

        const result: PngTextChunks = {};
        const header = Buffer.alloc(8);
        let offset = 8;

        while (true) {
            const { bytesRead } = await handle.read(header, 0, 8, offset);
            if (bytesRead < 8)
                break;

            const length = header.readUInt32BE(0);
            const type = header.toString('ascii', 4, 8);
            const dataOffset = offset + 8;

            if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
                if (length > 0) {
                    const data = Buffer.alloc(length);
                    const body = await handle.read(data, 0, length, dataOffset);
                    if (body.bytesRead === length) {
                        const parsed = parseTextChunk(type, data);
                        if (parsed?.key)
                            result[parsed.key] = parsed.value;
                    }
                }
            }

            if (type === 'IEND')
                break;
            offset = dataOffset + length + 4;
        }

        return result;
    } finally {
        await handle.close();
    }
}

/** Map common SD / Comfy PNG text keys into our prompt/workflow/extra fields. */
export function sdFieldsFromPngText(chunks: PngTextChunks): {
    prompt: string;
    workflow: string;
    extra: string;
} {
    return {
        prompt: chunks.parameters ?? chunks.prompt ?? '',
        workflow: chunks.workflow ?? '',
        extra: chunks.extra ?? '',
    };
}

/** Read SD metadata from PNG text chunks (tEXt / iTXt / zTXt). Empty on non-PNG or miss. */
export async function readPngSdMetadata(filePath: string): Promise<{
    prompt: string;
    workflow: string;
    extra: string;
}> {
    return sdFieldsFromPngText(await readPngTextChunks(filePath));
}
