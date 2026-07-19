import assert from 'node:assert/strict';
import {
    MEDIUM_MAX_TOTAL_PIXELS,
    WEBP_MAX_DIMENSION,
    clampToWebpMaxDimension,
    fitMediumPreviewSize,
} from '../src/lib/tools/imageGeometry.ts';

assert.equal(MEDIUM_MAX_TOTAL_PIXELS, 2_000_000);

assert.deepEqual(clampToWebpMaxDimension(3840, 2160), { width: 3840, height: 2160 });
assert.deepEqual(clampToWebpMaxDimension(20000, 10000), {
    width: WEBP_MAX_DIMENSION,
    height: Math.floor(10000 * (WEBP_MAX_DIMENSION / 20000)),
});

assert.deepEqual(fitMediumPreviewSize(1000, 800), { width: 1000, height: 800 });

const fourK = fitMediumPreviewSize(3840, 2160);
assert.ok(fourK.width * fourK.height <= MEDIUM_MAX_TOTAL_PIXELS);
assert.equal(Math.abs(fourK.width / fourK.height - 3840 / 2160) < 0.01, true);

const wallpaper = fitMediumPreviewSize(7680, 4320);
assert.ok(wallpaper.width * wallpaper.height <= MEDIUM_MAX_TOTAL_PIXELS);

console.log('convert.test.ts: all tests passed');
