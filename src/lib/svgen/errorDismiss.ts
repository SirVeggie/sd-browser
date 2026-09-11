/**
 * Panel generation errors stay readable when infinite auto-queue succeeds
 * immediately after a failure. Generate still clears the banner itself.
 */

export const ERROR_DISMISS_GRACE_MS = 2500;

type TimerId = ReturnType<typeof setTimeout>;

export type QueuedErrorDismissOptions = {
    hasError: () => boolean;
    clearError: () => void;
    graceMs?: number;
    now?: () => number;
    setTimeout?: (fn: () => void, ms: number) => TimerId;
    clearTimeout?: (id: TimerId) => void;
};

export function createQueuedErrorDismiss(options: QueuedErrorDismissOptions) {
    const graceMs = options.graceMs ?? ERROR_DISMISS_GRACE_MS;
    const now = options.now ?? Date.now;
    const startTimer = options.setTimeout ?? setTimeout;
    const stopTimer = options.clearTimeout ?? clearTimeout;

    let errorSetAt: number | null = null;
    let timer: TimerId | undefined;

    function cancelTimer() {
        if (timer == null)
            return;
        stopTimer(timer);
        timer = undefined;
    }

    function onErrorChanged(error: string | null) {
        cancelTimer();
        errorSetAt = error ? now() : null;
    }

    function scheduleAfterQueue() {
        if (!options.hasError() || timer != null)
            return;
        const remaining = errorSetAt != null
            ? Math.max(0, graceMs - (now() - errorSetAt))
            : graceMs;
        if (remaining === 0) {
            options.clearError();
            return;
        }
        timer = startTimer(() => {
            timer = undefined;
            if (options.hasError())
                options.clearError();
        }, remaining);
    }

    function dispose() {
        cancelTimer();
    }

    return { onErrorChanged, scheduleAfterQueue, dispose };
}
