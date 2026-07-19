/** Absolute per-side limit enforced by libwebp. */
export const WEBP_MAX_DIMENSION = 16383;

/** Medium quality tier: downscale so width×height ≤ this (≈1414×1414 square, ~1889×1059 16:9). */
export const MEDIUM_MAX_TOTAL_PIXELS = 2_000_000;

/**
 * Map stored pixel size + EXIF Orientation (1–8) to display width/height.
 * Tags 5–8 rotate by 90°/270°, so sides swap. Used for gallery layout and
 * resize math; pair with sharp `.rotate()` (no args) when encoding.
 */
export function orientedDisplaySize(
    width: number,
    height: number,
    orientation?: number,
): { width: number; height: number } {
    if (orientation !== undefined && orientation >= 5 && orientation <= 8) {
        return { width: height, height: width };
    }
    return { width, height };
}

/** Clamp a size so neither side exceeds the WebP max dimension. */
export function clampToWebpMaxDimension(
    width: number,
    height: number,
    maxDimension = WEBP_MAX_DIMENSION,
): { width: number; height: number } {
    if (width <= maxDimension && height <= maxDimension) {
        return { width, height };
    }
    const scale = Math.min(maxDimension / width, maxDimension / height);
    return {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale)),
    };
}

export function fitImageToMaxTotalPixels(
    width: number,
    height: number,
    maxTotalPixels: number,
): { width: number; height: number } {
    const totalPixels = width * height;
    if (totalPixels <= maxTotalPixels) {
        return { width, height };
    }

    const scale = Math.sqrt(maxTotalPixels / totalPixels);
    let nextWidth = Math.max(1, Math.floor(width * scale));
    let nextHeight = Math.max(1, Math.floor(height * scale));

    while (nextWidth * nextHeight > maxTotalPixels) {
        if (nextWidth / width >= nextHeight / height) {
            nextWidth--;
        } else {
            nextHeight--;
        }
    }

    return { width: nextWidth, height: nextHeight };
}

/** Target size for medium WebP: ≤2MP, then WebP per-side clamp. */
export function fitMediumPreviewSize(
    width: number,
    height: number,
    maxTotalPixels = MEDIUM_MAX_TOTAL_PIXELS,
): { width: number; height: number } {
    const fitted = fitImageToMaxTotalPixels(width, height, maxTotalPixels);
    return clampToWebpMaxDimension(fitted.width, fitted.height);
}
