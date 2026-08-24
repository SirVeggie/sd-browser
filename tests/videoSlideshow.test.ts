import assert from 'node:assert/strict';
import {
    isVideoPlaythroughWrap,
    videoSlideshowOnEvent,
    videoSlideshowSetup,
    type VideoSlideshowConfig,
} from '../src/lib/tools/videoSlideshow.ts';

function cfg(
    partial: Partial<VideoSlideshowConfig> & Pick<VideoSlideshowConfig, 'mode'>,
): VideoSlideshowConfig {
    return {
        intervalMs: 4000,
        loopEnabled: true,
        ...partial,
    };
}

{
    assert.deepEqual(
        videoSlideshowSetup(cfg({ mode: 'strict' })),
        { timerMs: 4000, listenEnded: false },
        'strict uses the interval only',
    );
    assert.deepEqual(
        videoSlideshowSetup(cfg({ mode: 'play-full' })),
        { timerMs: null, listenEnded: true },
        'play-full waits for the video to finish',
    );
    assert.deepEqual(
        videoSlideshowSetup(cfg({ mode: 'max-duration' })),
        { timerMs: 4000, listenEnded: true },
        'max-duration uses interval and ended',
    );
    assert.deepEqual(
        videoSlideshowSetup(cfg({ mode: 'loop-until', loopEnabled: true })),
        { timerMs: 4000, listenEnded: true },
        'loop-until with loop on waits for the interval',
    );
    assert.deepEqual(
        videoSlideshowSetup(cfg({ mode: 'loop-until', loopEnabled: false })),
        { timerMs: null, listenEnded: true },
        'loop-until with loop off waits for ended',
    );
}

{
    assert.deepEqual(
        videoSlideshowOnEvent(cfg({ mode: 'strict' }), 'timeout'),
        { type: 'advance' },
        'strict timeout advances',
    );
    assert.deepEqual(
        videoSlideshowOnEvent(cfg({ mode: 'strict' }), 'ended'),
        { type: 'ignore' },
        'strict ignores ended',
    );
}

{
    assert.deepEqual(
        videoSlideshowOnEvent(cfg({ mode: 'play-full' }), 'ended'),
        { type: 'advance' },
        'play-full ended advances',
    );
    assert.deepEqual(
        videoSlideshowOnEvent(cfg({ mode: 'play-full' }), 'timeout'),
        { type: 'ignore' },
        'play-full ignores timeout',
    );
}

{
    assert.deepEqual(
        videoSlideshowOnEvent(cfg({ mode: 'max-duration' }), 'timeout'),
        { type: 'advance' },
        'max-duration timeout advances',
    );
    assert.deepEqual(
        videoSlideshowOnEvent(cfg({ mode: 'max-duration' }), 'ended'),
        { type: 'advance' },
        'max-duration ended advances',
    );
}

{
    assert.deepEqual(
        videoSlideshowOnEvent(cfg({ mode: 'loop-until', loopEnabled: true }), 'timeout'),
        { type: 'disable-loop' },
        'loop-until timeout disables loop',
    );
    assert.deepEqual(
        videoSlideshowOnEvent(cfg({ mode: 'loop-until', loopEnabled: true }), 'ended'),
        { type: 'ignore' },
        'loop-until ignores wrap before the interval',
    );
    assert.deepEqual(
        videoSlideshowOnEvent(
            cfg({ mode: 'loop-until', loopEnabled: true, finishing: true }),
            'ended',
        ),
        { type: 'advance' },
        'loop-until advances when the finishing playthrough ends',
    );
    assert.deepEqual(
        videoSlideshowOnEvent(cfg({ mode: 'loop-until', loopEnabled: false }), 'ended'),
        { type: 'advance' },
        'loop-until with loop off advances on ended',
    );
    assert.deepEqual(
        videoSlideshowOnEvent(cfg({ mode: 'loop-until', loopEnabled: false }), 'timeout'),
        { type: 'ignore' },
        'loop-until with loop off ignores timeout',
    );
}

{
    assert.equal(isVideoPlaythroughWrap(9.8, 0.02, 10), true, 'wrap near end to start');
    assert.equal(isVideoPlaythroughWrap(5, 0.02, 10), false, 'seek from middle is not a wrap');
    assert.equal(isVideoPlaythroughWrap(0, 0.1, 10), false, 'start of playback is not a wrap');
    assert.equal(isVideoPlaythroughWrap(9.8, 9.9, 10), false, 'forward time is not a wrap');
    assert.equal(isVideoPlaythroughWrap(0.4, 0.01, 0.5), true, 'short clip wrap');
    assert.equal(isVideoPlaythroughWrap(9.8, 0.02, NaN), false, 'unknown duration');
}

console.log('videoSlideshow.test.ts: all tests passed');
