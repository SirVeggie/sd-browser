import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export type VideoPlaybackPrefs = {
    loop: boolean;
    muted: boolean;
    volume: number;
};

const defaults: VideoPlaybackPrefs = {
    loop: true,
    muted: true,
    volume: 1,
};

export const videoPlayback = writable<VideoPlaybackPrefs>({ ...defaults });

/** When non-null, fullscreen stage video uses this loop flag instead of the saved pref (slideshow). */
export const videoLoopOverride = writable<boolean | null>(null);

function clampVolume(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value))
        return defaults.volume;
    return Math.min(1, Math.max(0, value));
}

function coercePrefs(value: VideoPlaybackPrefs): VideoPlaybackPrefs {
    const rec = value && typeof value === "object" ? value : defaults;
    return {
        loop: typeof rec.loop === "boolean" ? rec.loop : defaults.loop,
        muted: typeof rec.muted === "boolean" ? rec.muted : defaults.muted,
        volume: clampVolume(rec.volume),
    };
}

export function patchVideoPlayback(partial: Partial<VideoPlaybackPrefs>): void {
    videoPlayback.update((current) => coercePrefs({ ...current, ...partial }));
}

export function syncVideoPlaybackWithLocalStorage(): void {
    syncMemory("videoPlayback", videoPlayback);
    videoPlayback.update(coercePrefs);
}
