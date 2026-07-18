import type { RequestEvent } from "@sveltejs/kit";
import { error } from "./responses";
import { PASS } from "$env/static/private";

const type = 'Bearer ';

/** Failed login probes before lockout. */
const MAX_FAILED_ATTEMPTS = 10;
/** Lockout window in ms (15 minutes). */
const WINDOW_MS = 15 * 60 * 1000;

type AttemptState = {
    count: number;
    resetAt: number;
};

const failedAttempts = new Map<string, AttemptState>();

function clientKey(e: RequestEvent): string {
    try {
        return e.getClientAddress();
    } catch {
        return 'unknown';
    }
}

function getAttemptState(key: string, now: number): AttemptState {
    const existing = failedAttempts.get(key);
    if (!existing || existing.resetAt <= now) {
        const fresh = { count: 0, resetAt: now + WINDOW_MS };
        failedAttempts.set(key, fresh);
        return fresh;
    }
    return existing;
}

function isRateLimited(e: RequestEvent): Response | false {
    const key = clientKey(e);
    const now = Date.now();
    const state = failedAttempts.get(key);
    if (!state || state.resetAt <= now) return false;
    if (state.count < MAX_FAILED_ATTEMPTS) return false;
    const retryAfterSec = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
    const res = error('Too many failed login attempts', 429);
    res.headers.set('Retry-After', String(retryAfterSec));
    return res;
}

function recordFailedAttempt(e: RequestEvent) {
    const key = clientKey(e);
    const now = Date.now();
    const state = getAttemptState(key, now);
    state.count += 1;
}

function clearFailedAttempts(e: RequestEvent) {
    failedAttempts.delete(clientKey(e));
}

/** Auth check for API routes. Lockout is enforced here; failures are counted only via checkLogin. */
export function invalidAuth(e: RequestEvent) {
    const limited = isRateLimited(e);
    if (limited) return limited;

    if (!PASS) return false;

    const auth = e.request.headers.get('Authorization');
    if (!auth) return error('No authorization header', 401);
    if (auth !== `${type}${PASS}`) return error('Invalid authorization header', 401);

    clearFailedAttempts(e);
    return false;
}

/** Login probe: same as invalidAuth, but failed attempts count toward rate limit. */
export function checkLogin(e: RequestEvent) {
    const limited = isRateLimited(e);
    if (limited) return limited;

    if (!PASS) return false;

    const auth = e.request.headers.get('Authorization');
    if (!auth || auth !== `${type}${PASS}`) {
        recordFailedAttempt(e);
        // Re-check in case this attempt crossed the threshold.
        const nowLimited = isRateLimited(e);
        if (nowLimited) return nowLimited;
        return error(auth ? 'Invalid authorization header' : 'No authorization header', 401);
    }

    clearFailedAttempts(e);
    return false;
}
