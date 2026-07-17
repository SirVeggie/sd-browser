/** Temporary IMG-search performance logs. Prefix: `[img-timing]`. */

export function startSearchTiming(): number {
    return performance.now();
}

export function logSearchTiming(
    phase: string,
    startedAt: number,
    detail?: Record<string, string | number | boolean | undefined | null>,
): void {
    const ms = Math.round((performance.now() - startedAt) * 10) / 10;
    const parts: string[] = [];
    if (detail) {
        for (const [key, value] of Object.entries(detail)) {
            if (value === undefined || value === null)
                continue;
            parts.push(`${key}=${value}`);
        }
    }
    const suffix = parts.length ? ` (${parts.join(', ')})` : '';
    console.log(`[img-timing] ${phase}: ${ms}ms${suffix}`);
}
