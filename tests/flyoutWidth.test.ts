import assert from 'node:assert/strict';
import {
    FLYOUT_CUSTOM_DEFAULT_PX,
    FLYOUT_CUSTOM_MAX_VW,
    FLYOUT_CUSTOM_MIN_PX,
    clampFlyoutCustomWidth,
    flyoutCustomMaxPx,
    resolvedFlyoutCustomWidth,
    shouldPersistFlyoutCustomWidth,
} from '../src/lib/tools/flyoutWidth.ts';

{
    assert.equal(flyoutCustomMaxPx(1000), 800, '80vw of 1000 is 800');
    assert.equal(flyoutCustomMaxPx(800), 640, '80vw of 800 is 640');
}

{
    const saved = 900;
    const wide = 1600;
    const narrow = 800;
    assert.equal(
        clampFlyoutCustomWidth(saved, wide),
        900,
        'saved px is used when it is under 80vw',
    );
    assert.equal(
        clampFlyoutCustomWidth(saved, narrow),
        flyoutCustomMaxPx(narrow),
        'window shrink display-clamps to 80vw without changing saved',
    );
    assert.equal(
        clampFlyoutCustomWidth(saved, wide),
        900,
        'growing the window restores the saved px',
    );
    assert.equal(saved, 900, 'clamp does not mutate saved');
}

{
    assert.equal(
        clampFlyoutCustomWidth(400, 2000),
        400,
        'width below the cap stays absolute pixels',
    );
    assert.equal(
        clampFlyoutCustomWidth(50, 1000),
        FLYOUT_CUSTOM_MIN_PX,
        'below min clamps up',
    );
    assert.equal(
        clampFlyoutCustomWidth(5000, 1000),
        800,
        'cannot display wider than 80vw',
    );
}

{
    const tinyViewport = 300;
    const maxPx = flyoutCustomMaxPx(tinyViewport);
    assert.ok(maxPx < FLYOUT_CUSTOM_MIN_PX, 'tiny viewport max is below the usual min');
    assert.equal(
        clampFlyoutCustomWidth(900, tinyViewport),
        maxPx,
        'min does not exceed 80vw on a tiny viewport',
    );
}

{
    assert.equal(resolvedFlyoutCustomWidth(undefined), FLYOUT_CUSTOM_DEFAULT_PX);
    assert.equal(resolvedFlyoutCustomWidth(Number.NaN), FLYOUT_CUSTOM_DEFAULT_PX);
    assert.equal(resolvedFlyoutCustomWidth(720), 720);
}

{
    const viewport = 800;
    const cap = flyoutCustomMaxPx(viewport);
    assert.equal(
        shouldPersistFlyoutCustomWidth(900, cap, viewport),
        false,
        'stuck at 80vw cap does not overwrite a larger saved width',
    );
    assert.equal(
        shouldPersistFlyoutCustomWidth(900, 500, viewport),
        true,
        'shrinking away from the cap persists',
    );
    assert.equal(
        shouldPersistFlyoutCustomWidth(400, 500, viewport),
        true,
        'growing under the cap persists',
    );
    assert.equal(
        shouldPersistFlyoutCustomWidth(undefined, 500, viewport),
        true,
        'first drag persists',
    );
}

{
    assert.equal(FLYOUT_CUSTOM_MAX_VW, 0.8);
}
