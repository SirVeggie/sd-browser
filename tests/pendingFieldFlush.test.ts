import assert from 'node:assert/strict';
import {
    collectPendingFieldWrites,
    registerPendingFieldPeek,
} from '../src/lib/svgen/pendingFieldFlush.ts';

function testRegisteredPeeksCollect() {
    const unregister = registerPendingFieldPeek(() => ({
        nodeId: '12',
        widgetName: 'text',
        value: '<lora:a:0.4>',
    }));
    const writes = collectPendingFieldWrites();
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.value, '<lora:a:0.4>');
    unregister();
    assert.equal(collectPendingFieldWrites().length, 0);
}

function testNullPeekIsSkipped() {
    const unregister = registerPendingFieldPeek(() => null);
    assert.equal(collectPendingFieldWrites().length, 0);
    unregister();
}

function testUnregisterIsIdempotent() {
    const unregister = registerPendingFieldPeek(() => ({
        nodeId: '1',
        widgetName: 'text',
        value: 'x',
    }));
    unregister();
    unregister();
    assert.equal(collectPendingFieldWrites().length, 0);
}

testRegisteredPeeksCollect();
testNullPeekIsSkipped();
testUnregisterIsIdempotent();
console.log('pendingFieldFlush tests passed');
