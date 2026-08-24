import assert from 'node:assert/strict';
import {
    parseLoraTriggerMap,
    triggersForLoraName,
    uniqueLoraNames,
} from '../src/lib/svgen/loraTriggers.ts';

{
    const map = {
        'style/Krea2MythD4rkL1nes.safetensors': ['D4rkL1nes'],
        'utility/other.safetensors': ['misc'],
    };
    assert.deepEqual(
        triggersForLoraName('style/Krea2MythD4rkL1nes.safetensors', map),
        ['D4rkL1nes'],
    );
    assert.deepEqual(triggersForLoraName('Krea2Myth', map), ['D4rkL1nes']);
    assert.deepEqual(
        triggersForLoraName('Krea2MythD4rkL1nes', map),
        ['D4rkL1nes'],
    );
    assert.deepEqual(triggersForLoraName('missing', map), []);
}

{
    const map = { Krea2Myth: ['D4rkL1nes'] };
    assert.deepEqual(
        triggersForLoraName('style/Krea2MythD4rkL1nes.safetensors', map),
        ['D4rkL1nes'],
    );
}

{
    const map = parseLoraTriggerMap({
        foo: ['a', 'b'],
        skip: 1,
        bar: ['c', 2, 'd'],
    });
    assert.deepEqual(map.foo, ['a', 'b']);
    assert.equal('skip' in map, false);
    assert.deepEqual(map.bar, ['c', 'd']);
}

{
    assert.deepEqual(
        uniqueLoraNames([' foo ', 'foo', '', 'bar', ' foo ']),
        ['foo', 'bar'],
    );
}

console.log('loraTriggers.test.ts: ok');
