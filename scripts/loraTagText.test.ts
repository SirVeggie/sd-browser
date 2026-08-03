import assert from 'node:assert/strict';
import {
    allLoraRowsEnabled,
    createEmptyLoraRow,
    parseLoraTagText,
    serializeLoraTagText,
    withAllLoraRowsEnabled,
} from '../src/lib/svgen/loraTagText.ts';

function testParseBasic() {
    const { rows, rest } = parseLoraTagText('<lora:wlop.safetensors:1.2>');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].enabled, true);
    assert.equal(rows[0].tagType, 'lora');
    assert.equal(rows[0].name, 'wlop.safetensors');
    assert.equal(rows[0].strength, 1.2);
    assert.equal(rows[0].clipStrength, 1.2);
    assert.equal(rest, '');
}

function testParseClipStrength() {
    const { rows } = parseLoraTagText('<lora:style.safetensors:0.8:0.5>');
    assert.equal(rows[0].strength, 0.8);
    assert.equal(rows[0].clipStrength, 0.5);
}

function testParseDisabled() {
    const { rows } = parseLoraTagText('<#lora:off.safetensors:1:0.7>');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].enabled, false);
    assert.equal(rows[0].name, 'off.safetensors');
    assert.equal(rows[0].strength, 1);
    assert.equal(rows[0].clipStrength, 0.7);
}

function testParseMultipleAndRest() {
    const text = 'hello <lora:a.safetensors:1><lyco:b.safetensors:0.5:0.25> world';
    const { rows, rest } = parseLoraTagText(text);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].tagType, 'lora');
    assert.equal(rows[1].tagType, 'lyco');
    assert.equal(rest, 'hello  world');
}

function testRoundTrip() {
    const original = '<lora:a.safetensors:1.2:0.9><#lora:b.safetensors:0.5>';
    const parsed = parseLoraTagText(original);
    const again = serializeLoraTagText(parsed.rows, parsed.rest, { includeClip: true });
    // Disabled row without explicit clip in source still has clip=strength after parse
    assert.equal(again, '<lora:a.safetensors:1.2:0.9><#lora:b.safetensors:0.5:0.5>');

    const noClip = serializeLoraTagText(parsed.rows, parsed.rest, { includeClip: false });
    assert.equal(noClip, '<lora:a.safetensors:1.2><#lora:b.safetensors:0.5>');
}

function testEnableAll() {
    const rows = parseLoraTagText(
        '<lora:a.safetensors:1><#lora:b.safetensors:1>',
    ).rows;
    assert.equal(allLoraRowsEnabled(rows), false);
    const on = withAllLoraRowsEnabled(rows, true);
    assert.equal(allLoraRowsEnabled(on), true);
    const off = withAllLoraRowsEnabled(on, false);
    assert.equal(off.every((r) => !r.enabled), true);
}

function testEmptyRow() {
    const row = createEmptyLoraRow('x.safetensors');
    assert.equal(row.enabled, true);
    assert.equal(row.strength, 1);
    assert.equal(row.name, 'x.safetensors');
}

testParseBasic();
testParseClipStrength();
testParseDisabled();
testParseMultipleAndRest();
testRoundTrip();
testEnableAll();
testEmptyRow();
console.log('loraTagText.test.ts: ok');
