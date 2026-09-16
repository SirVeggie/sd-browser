import assert from 'node:assert/strict';
import {
    addMappedClassifyTag,
    applyClassifyTags,
    hasAssignedClassifyTags,
    imageHasAnyClassifyTag,
    labelFromScores,
    managedClassifyTagList,
    normalizeNsfwClassifySettings,
    nsfwClassifyStoreDefaults,
    removeMappedClassifyTag,
    renameMappedClassifyTags,
    softmax,
} from '../src/lib/types/nsfwClassify.ts';
import { nsfwClassifyInputSize } from '../src/lib/server/nsfwClassifyComputeCore.ts';

assert.equal(hasAssignedClassifyTags(nsfwClassifyStoreDefaults), false);
assert.equal(
    hasAssignedClassifyTags(addMappedClassifyTag(nsfwClassifyStoreDefaults, 'explicit', 'nsfw')),
    true,
);

const mapped = addMappedClassifyTag(
    addMappedClassifyTag(nsfwClassifyStoreDefaults, 'explicit', 'nsfw'),
    'general',
    'safe',
);

assert.deepEqual(applyClassifyTags(['favourite'], 'explicit', mapped), ['favourite', 'nsfw']);
assert.deepEqual(applyClassifyTags(['favourite', 'nsfw'], 'general', mapped), ['favourite', 'nsfw', 'safe']);
assert.deepEqual(applyClassifyTags(['favourite', 'safe'], 'explicit', mapped), ['favourite', 'safe', 'nsfw']);

assert.equal(imageHasAnyClassifyTag(['favourite'], mapped), false);
assert.equal(imageHasAnyClassifyTag(['favourite', 'nsfw'], mapped), true);
assert.deepEqual(managedClassifyTagList(mapped), ['safe', 'nsfw']);

const renamed = renameMappedClassifyTags(mapped, 'nsfw', 'explicit');
assert.deepEqual(renamed.labels.explicit, ['explicit']);
assert.equal(hasAssignedClassifyTags(removeMappedClassifyTag(mapped, 'nsfw')), true);
assert.equal(
    hasAssignedClassifyTags(removeMappedClassifyTag(removeMappedClassifyTag(mapped, 'nsfw'), 'safe')),
    false,
);

const normalized = normalizeNsfwClassifySettings({
    autoClassify: true,
    labels: {
        general: [' safe ', 'safe', ''],
        explicit: ['nsfw'],
    } as never,
});
assert.equal(normalized.autoClassify, true);
assert.deepEqual(normalized.labels.general, ['safe']);
assert.deepEqual(normalized.labels.sensitive, []);

const probabilities = softmax([1, 2, 3, 0]);
assert.equal(probabilities.length, 4);
assert.ok(Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
assert.equal(labelFromScores([0.1, 0.2, 0.15, 0.55]), 'explicit');
assert.equal(labelFromScores([0.4, 0.3, 0.2, 0.1]), 'general');

assert.deepEqual(nsfwClassifyInputSize(undefined), { width: 384, height: 384 });
assert.deepEqual(
    nsfwClassifyInputSize([{ isTensor: true, shape: [1, 3, 224, 224] }]),
    { width: 224, height: 224 },
);

console.log('nsfwClassify tests passed');
