import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
    parsePngTextChunks,
    sdFieldsFromPngText,
} from '../src/lib/server/pngTextChunks.ts';

function pngChunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    return Buffer.concat([length, typeBuf, data, crc]);
}

function buildPng(chunks: Buffer[]): Buffer {
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ...chunks,
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

const sampleParams =
    'cute, mythical deer girl\nNegative prompt: low quality\nSteps: 20, Sampler: Euler, Seed: 1';

{
    const data = Buffer.concat([
        Buffer.from('parameters', 'latin1'),
        Buffer.from([0]),
        Buffer.from(sampleParams, 'latin1'),
    ]);
    const png = buildPng([pngChunk('IHDR', Buffer.alloc(13)), pngChunk('tEXt', data)]);
    const chunks = parsePngTextChunks(png);
    assert.equal(chunks.parameters, sampleParams, 'tEXt parameters');
    assert.equal(sdFieldsFromPngText(chunks).prompt, sampleParams, 'sd fields from tEXt');
}

{
    // Uncompressed iTXt — what Windows Properties shows for long A1111 metadata.
    const data = Buffer.concat([
        Buffer.from('parameters', 'latin1'),
        Buffer.from([0]), // key null
        Buffer.from([0]), // compression flag
        Buffer.from([0]), // compression method
        Buffer.from([0]), // empty language + null
        Buffer.from([0]), // empty translated keyword + null
        Buffer.from(sampleParams, 'utf8'),
    ]);
    const png = buildPng([pngChunk('IHDR', Buffer.alloc(13)), pngChunk('iTXt', data)]);
    const chunks = parsePngTextChunks(png);
    assert.equal(chunks.parameters, sampleParams, 'uncompressed iTXt parameters');
    assert.equal(sdFieldsFromPngText(chunks).prompt, sampleParams, 'sd fields from iTXt');
}

{
    const compressed = zlib.deflateSync(Buffer.from(sampleParams, 'utf8'));
    const data = Buffer.concat([
        Buffer.from('parameters', 'latin1'),
        Buffer.from([0]),
        Buffer.from([1]), // compressed
        Buffer.from([0]), // zlib
        Buffer.from([0]),
        Buffer.from([0]),
        compressed,
    ]);
    const png = buildPng([pngChunk('IHDR', Buffer.alloc(13)), pngChunk('iTXt', data)]);
    assert.equal(parsePngTextChunks(png).parameters, sampleParams, 'compressed iTXt parameters');
}

{
    const compressed = zlib.deflateSync(Buffer.from(sampleParams, 'latin1'));
    const data = Buffer.concat([
        Buffer.from('parameters', 'latin1'),
        Buffer.from([0]),
        Buffer.from([0]), // compression method zlib
        compressed,
    ]);
    const png = buildPng([pngChunk('IHDR', Buffer.alloc(13)), pngChunk('zTXt', data)]);
    assert.equal(parsePngTextChunks(png).parameters, sampleParams, 'zTXt parameters');
}

{
    const promptData = Buffer.concat([
        Buffer.from('prompt', 'latin1'),
        Buffer.from([0]),
        Buffer.from('{"1":{}}', 'latin1'),
    ]);
    const workflowData = Buffer.concat([
        Buffer.from('workflow', 'latin1'),
        Buffer.from([0]),
        Buffer.from('{"nodes":[]}', 'latin1'),
    ]);
    const png = buildPng([
        pngChunk('IHDR', Buffer.alloc(13)),
        pngChunk('tEXt', promptData),
        pngChunk('tEXt', workflowData),
    ]);
    const fields = sdFieldsFromPngText(parsePngTextChunks(png));
    assert.equal(fields.prompt, '{"1":{}}', 'comfy prompt key');
    assert.equal(fields.workflow, '{"nodes":[]}', 'comfy workflow key');
}

assert.deepEqual(parsePngTextChunks(Buffer.from('not a png')), {}, 'non-png');

console.log('pngTextChunks tests passed');
