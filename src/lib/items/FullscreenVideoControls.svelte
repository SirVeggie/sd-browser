<script lang="ts" context="module">
    /** Floor of the slider’s dB range. 0 on the slider is still true silence. */
    const VOLUME_MIN_DB = -48;

    function volumeSliderToGain(slider: number): number {
        if (!(slider > 0))
            return 0;
        if (slider >= 1)
            return 1;
        return 10 ** ((1 - slider) * VOLUME_MIN_DB / 20);
    }

    function volumeGainToSlider(gain: number): number {
        if (!(gain > 0))
            return 0;
        if (gain >= 1)
            return 1;
        const db = 20 * Math.log10(gain);
        return Math.max(0, Math.min(1, 1 - db / VOLUME_MIN_DB));
    }
</script>

<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { get } from "svelte/store";
    import { patchVideoPlayback, videoLoopOverride, videoPlayback } from "$lib/stores/videoPlaybackStore";

    export let video: HTMLVideoElement | undefined = undefined;

    const HIDE_MS_MOUSE = 1800;
    const HIDE_MS_TAP = 2500;

    let visible = false;
    let overBar = false;
    let seeking = false;
    let playing = false;
    let looping = get(videoPlayback).loop;
    let muted = get(videoPlayback).muted;
    let volume = get(videoPlayback).volume;
    let currentTime = 0;
    let duration = 0;
    let ignoreNextTapClick = false;
    let coarsePointer = false;
    let coarseHoldPointerId: number | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let bound: HTMLVideoElement | undefined;

    function formatTime(seconds: number): string {
        if (!Number.isFinite(seconds) || seconds < 0)
            return "0:00";
        const total = Math.floor(seconds);
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    }

    function isTextInputActive(): boolean {
        const active = document.activeElement;
        return active instanceof HTMLInputElement
            || active instanceof HTMLTextAreaElement
            || active instanceof HTMLSelectElement
            || (active instanceof HTMLElement && active.isContentEditable);
    }

    function clearHideTimer() {
        if (!hideTimer)
            return;
        clearTimeout(hideTimer);
        hideTimer = undefined;
    }

    function hideDelay(): number {
        return coarsePointer ? HIDE_MS_TAP : HIDE_MS_MOUSE;
    }

    function showControls(hideAfterMs = hideDelay()) {
        visible = true;
        clearHideTimer();
        if (overBar || seeking)
            return;
        hideTimer = setTimeout(() => {
            hideTimer = undefined;
            if (!overBar && !seeking)
                visible = false;
        }, hideAfterMs);
    }

    function beginCoarseHold(e: PointerEvent) {
        coarsePointer = true;
        coarseHoldPointerId = e.pointerId;
        visible = true;
        clearHideTimer();
    }

    function onWindowPointerUp(e: PointerEvent) {
        if (coarseHoldPointerId === undefined || e.pointerId !== coarseHoldPointerId)
            return;
        coarseHoldPointerId = undefined;
        showControls(HIDE_MS_TAP);
    }

    function hideControls() {
        if (overBar || seeking)
            return;
        clearHideTimer();
        visible = false;
    }

    function readState(el: HTMLVideoElement) {
        playing = !el.paused;
        currentTime = el.currentTime || 0;
        duration = Number.isFinite(el.duration) ? el.duration : 0;
        muted = el.muted;
        volume = volumeGainToSlider(el.volume);
        looping = el.loop;
    }

    function onTimeUpdate() {
        if (!bound || seeking)
            return;
        currentTime = bound.currentTime || 0;
        duration = Number.isFinite(bound.duration) ? bound.duration : duration;
    }

    function onPlay() {
        playing = true;
    }

    function onPause() {
        playing = false;
    }

    function onDurationChange() {
        if (!bound)
            return;
        duration = Number.isFinite(bound.duration) ? bound.duration : 0;
    }

    function unbind(el: HTMLVideoElement | undefined) {
        if (!el)
            return;
        el.removeEventListener("timeupdate", onTimeUpdate);
        el.removeEventListener("play", onPlay);
        el.removeEventListener("pause", onPause);
        el.removeEventListener("durationchange", onDurationChange);
        el.removeEventListener("seeked", onTimeUpdate);
    }

    function bind(el: HTMLVideoElement | undefined) {
        if (bound === el)
            return;
        unbind(bound);
        bound = el;
        if (!el)
            return;
        el.loop = get(videoLoopOverride) ?? get(videoPlayback).loop;
        el.volume = volumeSliderToGain(get(videoPlayback).volume);
        el.muted = get(videoPlayback).muted;
        readState(el);
        el.addEventListener("timeupdate", onTimeUpdate);
        el.addEventListener("play", onPlay);
        el.addEventListener("pause", onPause);
        el.addEventListener("durationchange", onDurationChange);
        el.addEventListener("seeked", onTimeUpdate);
    }

    $: bind(video);
    $: applyLoop(video, $videoPlayback.loop, $videoLoopOverride);

    function applyLoop(
        el: HTMLVideoElement | undefined,
        userLoop: boolean,
        override: boolean | null,
    ) {
        if (!el)
            return;
        const next = override ?? userLoop;
        el.loop = next;
        looping = next;
    }

    function togglePlay() {
        if (!bound)
            return;
        if (bound.paused)
            void bound.play().catch(() => undefined);
        else
            bound.pause();
        showControls();
    }

    function toggleLoop() {
        looping = !looping;
        patchVideoPlayback({ loop: looping });
        videoLoopOverride.set(null);
        if (bound)
            bound.loop = looping;
        showControls();
    }

    function toggleMute() {
        if (!bound)
            return;
        muted = !bound.muted;
        bound.muted = muted;
        if (!muted && bound.volume === 0) {
            volume = get(videoPlayback).volume || 0.5;
            bound.volume = volumeSliderToGain(volume);
            patchVideoPlayback({ muted, volume });
        } else {
            patchVideoPlayback({ muted });
        }
        showControls();
    }

    function onVolumeInput(e: Event) {
        const target = e.currentTarget;
        if (!(target instanceof HTMLInputElement) || !bound)
            return;
        const next = Number(target.value);
        volume = next;
        bound.volume = volumeSliderToGain(next);
        bound.muted = next === 0;
        muted = bound.muted;
        patchVideoPlayback({
            volume: next || get(videoPlayback).volume,
            muted,
        });
        showControls();
    }

    function onSeekInput(e: Event) {
        const target = e.currentTarget;
        if (!(target instanceof HTMLInputElement) || !bound)
            return;
        seeking = true;
        currentTime = Number(target.value);
        bound.currentTime = currentTime;
        showControls();
    }

    function onSeekEnd() {
        seeking = false;
        showControls();
    }

    function onPointerMove(e: PointerEvent) {
        if (e.pointerType !== "mouse")
            return;
        coarsePointer = false;
        showControls(HIDE_MS_MOUSE);
    }

    function onPointerLeave(e: PointerEvent) {
        // Touch/pen fire pointerleave on finger-up even while still over the
        // element. Immediate hide makes the bar impossible to use.
        if (e.pointerType !== "mouse")
            return;
        hideControls();
    }

    function onBarEnter(e: PointerEvent) {
        if (e.pointerType !== "mouse")
            return;
        overBar = true;
        clearHideTimer();
        visible = true;
    }

    function onBarLeave(e: PointerEvent) {
        if (e.pointerType !== "mouse")
            return;
        overBar = false;
        showControls(HIDE_MS_MOUSE);
    }

    function stopOverlayClose(e: Event) {
        e.stopPropagation();
    }

    function onBarPointerDown(e: PointerEvent) {
        e.stopPropagation();
        if (e.pointerType === "mouse")
            return;
        beginCoarseHold(e);
    }

    function onTapZonePointerDown(e: PointerEvent) {
        if (e.pointerType === "mouse")
            return;
        ignoreNextTapClick = true;
        e.stopPropagation();
        beginCoarseHold(e);
    }

    function onTapZoneClick(e: MouseEvent) {
        if (!ignoreNextTapClick)
            return;
        ignoreNextTapClick = false;
        e.stopPropagation();
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key !== " " || e.repeat)
            return;
        if (isTextInputActive())
            return;
        e.preventDefault();
        e.stopImmediatePropagation();
        togglePlay();
    }

    onMount(() => {
        window.addEventListener("keydown", onKeydown, { capture: true });
        window.addEventListener("pointerup", onWindowPointerUp, { capture: true });
        window.addEventListener("pointercancel", onWindowPointerUp, { capture: true });
        return () => {
            window.removeEventListener("keydown", onKeydown, { capture: true });
            window.removeEventListener("pointerup", onWindowPointerUp, { capture: true });
            window.removeEventListener("pointercancel", onWindowPointerUp, { capture: true });
        };
    });

    onDestroy(() => {
        coarseHoldPointerId = undefined;
        clearHideTimer();
        unbind(bound);
        bound = undefined;
    });
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
    class="chrome"
    on:pointermove={onPointerMove}
    on:pointerleave={onPointerLeave}
>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="tap-zone"
        on:pointerdown={onTapZonePointerDown}
        on:click={onTapZoneClick}
    ></div>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="bar"
        class:visible
        on:pointerenter={onBarEnter}
        on:pointerleave={onBarLeave}
        on:pointerdown={onBarPointerDown}
        on:click={stopOverlayClose}
    >
        <button
            type="button"
            class="icon-btn"
            aria-label={playing ? "Pause" : "Play"}
            on:click={togglePlay}
        >
            {#if playing}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="6" y="5" width="4.5" height="14" rx="1" fill="currentColor" />
                    <rect x="13.5" y="5" width="4.5" height="14" rx="1" fill="currentColor" />
                </svg>
            {:else}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" />
                </svg>
            {/if}
        </button>

        <span class="time">{formatTime(currentTime)}</span>

        <input
            class="seek"
            type="range"
            min="0"
            max={duration || 0}
            step="0.05"
            value={currentTime}
            aria-label="Seek"
            disabled={!duration}
            on:input={onSeekInput}
            on:pointerup={onSeekEnd}
            on:keyup={onSeekEnd}
        />

        <span class="time">{formatTime(duration)}</span>

        <button
            type="button"
            class="icon-btn"
            class:on={looping}
            aria-label="Loop"
            aria-pressed={looping}
            on:click={toggleLoop}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                    d="M17 5h-7a5 5 0 0 0 0 10h8"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.85"
                    stroke-linecap="round"
                />
                <path d="M15.5 2.75 18.5 5l-3 2.25" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" />
                <path
                    d="M7 19h7a5 5 0 0 0 0-10H6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.85"
                    stroke-linecap="round"
                />
                <path d="M8.5 21.25 5.5 19l3-2.25" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        </button>

        <button
            type="button"
            class="icon-btn"
            aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
            on:click={toggleMute}
        >
            {#if muted || volume === 0}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 10v4h3.2L12 18.5V5.5L7.2 10H4z" fill="currentColor" />
                    <path d="M16 9.5 20.5 14M20.5 9.5 16 14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" />
                </svg>
            {:else}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 10v4h3.2L12 18.5V5.5L7.2 10H4z" fill="currentColor" />
                    <path d="M15.4 8.6a4.2 4.2 0 0 1 0 6.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                    <path d="M17.7 6.3a7.2 7.2 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                </svg>
            {/if}
        </button>

        <input
            class="volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            aria-label="Volume"
            on:input={onVolumeInput}
        />
    </div>
</div>

<style lang="scss">
    .chrome {
        grid-area: 1 / 1;
        position: relative;
        z-index: 4;
        width: 100%;
        height: 100%;
        min-height: 0;
        pointer-events: auto;
    }

    .tap-zone {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: min(20vh, 35%);
        pointer-events: auto;
    }

    .bar {
        position: absolute;
        left: 0.6rem;
        right: 0.6rem;
        bottom: 0.45rem;
        display: flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.4rem 0.55rem;
        border-radius: 0.55rem;
        background: rgba(16, 14, 12, 0.78);
        backdrop-filter: blur(10px);
        box-shadow: 0 0.35em 1.1em rgba(0, 0, 0, 0.35);
        color: var(--ink);
        pointer-events: none;
        opacity: 0;
        transform: translateY(0.35rem);
        transition:
            opacity 0.18s ease,
            transform 0.18s ease;

        &.visible {
            pointer-events: auto;
            opacity: 1;
            transform: translateY(0);
        }
    }

    .icon-btn {
        appearance: none;
        flex: 0 0 auto;
        width: 2rem;
        height: 2rem;
        padding: 0;
        border: none;
        border-radius: 0.4rem;
        background: transparent;
        color: var(--ink);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;

        svg {
            width: 1.15rem;
            height: 1.15rem;
        }

        &:hover,
        &:focus-visible {
            background: var(--accent-soft);
            color: var(--accent);
        }

        &.on {
            color: var(--accent);
        }
    }

    .time {
        flex: 0 0 auto;
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
        color: var(--muted);
        min-width: 2.4em;
    }

    .seek {
        flex: 1 1 auto;
        min-width: 3rem;
    }

    .volume {
        flex: 0 0 4.5rem;
        width: 4.5rem;
    }

    .seek,
    .volume {
        appearance: none;
        height: 0.28rem;
        border-radius: 99px;
        background: rgba(235, 228, 216, 0.22);
        outline: none;

        &::-webkit-slider-thumb {
            appearance: none;
            width: 0.8rem;
            height: 0.8rem;
            border-radius: 50%;
            background: var(--accent);
            border: none;
            cursor: pointer;
        }

        &::-moz-range-thumb {
            width: 0.8rem;
            height: 0.8rem;
            border-radius: 50%;
            background: var(--accent);
            border: none;
            cursor: pointer;
        }
    }

    @media (max-width: 520px) {
        .volume {
            display: none;
        }

        .bar {
            gap: 0.3rem;
            padding: 0.35rem 0.45rem;
        }
    }
</style>
