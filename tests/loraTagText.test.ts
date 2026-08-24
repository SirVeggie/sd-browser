import assert from 'node:assert/strict';
import {
    createEmptyLoraRow,
    forceDisableLoraTagsInText,
    overlayLoraRowStrengths,
    parseLoraTagText,
    serializeLoraTagText,
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

function testParseOnePerLine() {
    const text = '<lora:a.safetensors:1>\n<#lora:b.safetensors:0.5>\n';
    const { rows, rest } = parseLoraTagText(text);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].enabled, true);
    assert.equal(rows[1].enabled, false);
    assert.equal(rest, '');
}

function testRoundTrip() {
    const original = '<lora:a.safetensors:1.2:0.9><#lora:b.safetensors:0.5>';
    const parsed = parseLoraTagText(original);
    const again = serializeLoraTagText(parsed.rows, parsed.rest, { includeClip: true });
    // Disabled row without explicit clip in source still has clip=strength after parse
    assert.equal(again, '<lora:a.safetensors:1.2:0.9>\n<#lora:b.safetensors:0.5:0.5>');

    const noClip = serializeLoraTagText(parsed.rows, parsed.rest, { includeClip: false });
    assert.equal(noClip, '<lora:a.safetensors:1.2>\n<#lora:b.safetensors:0.5>');
}

function testForceDisablePreservesDisabled() {
    const text = '<lora:a.safetensors:1><#lora:b.safetensors:0.5>';
    const forced = forceDisableLoraTagsInText(text, false);
    assert.equal(forced, '<#lora:a.safetensors:1>\n<#lora:b.safetensors:0.5>');
    // Original parse of source still has a enabled
    assert.equal(parseLoraTagText(text).rows[0].enabled, true);
    assert.equal(parseLoraTagText(forced).rows.every((r) => !r.enabled), true);
}

function testForceDisableNoopWhenAlreadyOff() {
    const text = '<#lora:a.safetensors:1>';
    assert.equal(forceDisableLoraTagsInText(text, false), text);
}

function testEmptyRow() {
    const row = createEmptyLoraRow();
    assert.equal(row.enabled, false);
    assert.equal(row.strength, 1);
    assert.equal(row.name, '');
}

function testEmptyNameRoundTrip() {
    const text = serializeLoraTagText([createEmptyLoraRow()], '', { includeClip: false });
    assert.equal(text, '<#lora::1>');
    const { rows } = parseLoraTagText(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].enabled, false);
    assert.equal(rows[0].name, '');
    assert.equal(rows[0].strength, 1);
}

function testOverlayStrengthWithoutClipCopiesBoth() {
    const { rows } = parseLoraTagText('<lora:a.safetensors:1>');
    const next = overlayLoraRowStrengths(
        rows,
        [{ id: rows[0].id, key: 'strength', raw: '0.4' }],
        false,
    );
    assert.equal(next[0].strength, 0.4);
    assert.equal(next[0].clipStrength, 0.4);
    assert.equal(rows[0].strength, 1);
    assert.equal(
        serializeLoraTagText(next, '', { includeClip: false }),
        '<lora:a.safetensors:0.4>',
    );
}

function testOverlayClipIndependentWhenShowClip() {
    const { rows } = parseLoraTagText('<lora:a.safetensors:1:1>');
    const next = overlayLoraRowStrengths(
        rows,
        [{ id: rows[0].id, key: 'clipStrength', raw: '0.2' }],
        true,
    );
    assert.equal(next[0].strength, 1);
    assert.equal(next[0].clipStrength, 0.2);
}

function testOverlayIgnoresInvalidRaw() {
    const { rows } = parseLoraTagText('<lora:a.safetensors:1>');
    const next = overlayLoraRowStrengths(
        rows,
        [{ id: rows[0].id, key: 'strength', raw: 'nope' }],
        false,
    );
    assert.equal(next[0].strength, 1);
}

testParseBasic();
testParseClipStrength();
testParseDisabled();
testParseMultipleAndRest();
testParseOnePerLine();
testRoundTrip();
testForceDisablePreservesDisabled();
testForceDisableNoopWhenAlreadyOff();
testEmptyRow();
testEmptyNameRoundTrip();
testOverlayStrengthWithoutClipCopiesBoth();
testOverlayClipIndependentWhenShowClip();
testOverlayIgnoresInvalidRaw();
console.log('loraTagText.test.ts: ok');
