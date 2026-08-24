import type { VideoSlideshowMode } from "$lib/types/misc";

export type VideoSlideshowConfig = {
    mode: VideoSlideshowMode;
    intervalMs: number;
    loopEnabled: boolean;
    /** Loop-until after the interval: waiting for the current playthrough to finish. */
    finishing?: boolean;
};

export type VideoSlideshowSetup = {
    /** Start a timer for this many ms; null means no timer. */
    timerMs: number | null;
    listenEnded: boolean;
};

export type VideoSlideshowEvent = "timeout" | "ended";

export type VideoSlideshowAction =
    | { type: "advance" }
    | { type: "disable-loop" }
    | { type: "ignore" };

export function videoSlideshowSetup(config: VideoSlideshowConfig): VideoSlideshowSetup {
    switch (config.mode) {
        case "strict":
            return { timerMs: config.intervalMs, listenEnded: false };
        case "play-full":
            return { timerMs: null, listenEnded: true };
        case "max-duration":
            return { timerMs: config.intervalMs, listenEnded: true };
        case "loop-until":
            if (config.loopEnabled)
                return { timerMs: config.intervalMs, listenEnded: true };
            return { timerMs: null, listenEnded: true };
        default: {
            const _exhaustive: never = config.mode;
            return _exhaustive;
        }
    }
}

export function videoSlideshowOnEvent(
    config: VideoSlideshowConfig,
    event: VideoSlideshowEvent,
): VideoSlideshowAction {
    switch (config.mode) {
        case "strict":
            return event === "timeout" ? { type: "advance" } : { type: "ignore" };
        case "play-full":
            return event === "ended" ? { type: "advance" } : { type: "ignore" };
        case "max-duration":
            return { type: "advance" };
        case "loop-until":
            if (!config.loopEnabled)
                return event === "ended" ? { type: "advance" } : { type: "ignore" };
            if (event === "timeout")
                return { type: "disable-loop" };
            return config.finishing ? { type: "advance" } : { type: "ignore" };
        default: {
            const _exhaustive: never = config.mode;
            return _exhaustive;
        }
    }
}

/** True when currentTime jumped from near the end back to the start (HTML loop wrap). */
export function isVideoPlaythroughWrap(
    prevTime: number,
    nextTime: number,
    duration: number,
): boolean {
    if (!(prevTime > 0) || !(nextTime < prevTime))
        return false;
    if (!Number.isFinite(duration) || duration <= 0)
        return false;
    const window = Math.min(0.4, Math.max(0.08, duration * 0.2));
    return prevTime >= duration - window && nextTime <= window;
}
