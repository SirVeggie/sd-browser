import assert from 'node:assert/strict';
import { createQueuedErrorDismiss } from '../src/lib/svgen/errorDismiss.ts';

type FakeTimer = { id: number; fn: () => void; at: number };

function createHarness(graceMs = 1000) {
    let error: string | null = null;
    let now = 0;
    let nextId = 1;
    const timers = new Map<number, FakeTimer>();

    const dismiss = createQueuedErrorDismiss({
        hasError: () => error != null,
        clearError: () => {
            error = null;
            dismiss.onErrorChanged(null);
        },
        graceMs,
        now: () => now,
        setTimeout: (fn, ms) => {
            const id = nextId++;
            timers.set(id, { id, fn, at: now + ms });
            return id as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeout: (id) => {
            timers.delete(id as unknown as number);
        },
    });

    return {
        get error() {
            return error;
        },
        setError(message: string) {
            error = message;
            dismiss.onErrorChanged(message);
        },
        clearError() {
            error = null;
            dismiss.onErrorChanged(null);
        },
        schedule() {
            dismiss.scheduleAfterQueue();
        },
        dispose() {
            dismiss.dispose();
        },
        advance(ms: number) {
            now += ms;
            for (const timer of [...timers.values()]) {
                if (timer.at > now)
                    continue;
                timers.delete(timer.id);
                timer.fn();
            }
        },
        pendingCount() {
            return timers.size;
        },
    };
}

function testNoErrorIsNoOp() {
    const h = createHarness();
    h.schedule();
    assert.equal(h.error, null);
    assert.equal(h.pendingCount(), 0);
}

function testFreshErrorWaitsGraceThenClears() {
    const h = createHarness(1000);
    h.setError('boom');
    h.schedule();
    assert.equal(h.error, 'boom');
    h.advance(999);
    assert.equal(h.error, 'boom');
    h.advance(1);
    assert.equal(h.error, null);
}

function testStaleErrorClearsImmediately() {
    const h = createHarness(1000);
    h.setError('boom');
    h.advance(1000);
    h.schedule();
    assert.equal(h.error, null);
    assert.equal(h.pendingCount(), 0);
}

function testNewerErrorCancelsPendingDismiss() {
    const h = createHarness(1000);
    h.setError('first');
    h.schedule();
    h.advance(200);
    h.setError('second');
    h.advance(2000);
    assert.equal(h.error, 'second');
    assert.equal(h.pendingCount(), 0);
}

function testSecondQueueDoesNotResetGrace() {
    const h = createHarness(1000);
    h.setError('boom');
    h.schedule();
    h.advance(400);
    h.schedule();
    assert.equal(h.pendingCount(), 1);
    h.advance(600);
    assert.equal(h.error, null);
}

function testManualClearCancelsTimer() {
    const h = createHarness(1000);
    h.setError('boom');
    h.schedule();
    h.clearError();
    assert.equal(h.pendingCount(), 0);
    h.advance(1000);
    assert.equal(h.error, null);
}

function testDisposeCancelsTimer() {
    const h = createHarness(1000);
    h.setError('boom');
    h.schedule();
    h.dispose();
    assert.equal(h.pendingCount(), 0);
    h.advance(1000);
    assert.equal(h.error, 'boom');
}

function testUnknownSetTimeUsesFullGrace() {
    let error: string | null = 'boom';
    let delay = -1;
    const dismiss = createQueuedErrorDismiss({
        hasError: () => error != null,
        clearError: () => {
            error = null;
        },
        graceMs: 1000,
        now: () => 50,
        setTimeout: (_fn, ms) => {
            delay = ms;
            return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeout: () => undefined,
    });
    dismiss.scheduleAfterQueue();
    assert.equal(delay, 1000);
    assert.equal(error, 'boom');
}

testNoErrorIsNoOp();
testFreshErrorWaitsGraceThenClears();
testStaleErrorClearsImmediately();
testNewerErrorCancelsPendingDismiss();
testSecondQueueDoesNotResetGrace();
testManualClearCancelsTimer();
testDisposeCancelsTimer();
testUnknownSetTimeUsesFullGrace();
console.log('errorDismiss tests passed');
