import { writable, get } from 'svelte/store';
import { notify } from '$lib/components/Notifier.svelte';

/** Dynamic Comfy on its port (default 8190): offers "Send to DC" in image menus while it runs. */
export type DcomfyClientStatus = { available: boolean; publicUrl: string; port: number };

export const dcomfyStatus = writable<DcomfyClientStatus>({ available: false, publicUrl: '', port: 8190 });

const REFRESH_MS = 15_000;
let lastRefresh = 0;
let inFlight: Promise<void> | undefined;

/** Re-checks at most every 15 s unless forced; menus read the store, so call this when they may open soon. */
export function refreshDcomfyStatus(force = false): Promise<void> {
    if (inFlight) return inFlight;
    if (!force && Date.now() - lastRefresh < REFRESH_MS) return Promise.resolve();
    lastRefresh = Date.now();
    inFlight = fetch('/api/dcomfy/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
            if (body && typeof body.available === 'boolean')
                dcomfyStatus.set({
                    available: body.available,
                    publicUrl: typeof body.publicUrl === 'string' ? body.publicUrl : '',
                    port: typeof body.port === 'number' ? body.port : 8190,
                });
        })
        .catch(() => dcomfyStatus.update((s) => ({ ...s, available: false })))
        .finally(() => { inFlight = undefined; });
    return inFlight;
}

function dcomfyPageUrl(): string {
    const { publicUrl, port } = get(dcomfyStatus);
    const base = publicUrl || `${location.protocol}//${location.hostname}:${port}`;
    return `${base}/dc/`;
}

/** Sends the image to Dynamic Comfy: its workflow opens with the image's values, or (no Dynamic Comfy
 *  metadata) its agent opens with the image attached. Opens Dynamic Comfy when no tab of it is open. */
export async function sendToDcomfy(imageId: string): Promise<void> {
    let body: { mode?: string; workflow?: string; clients?: number; error?: string } = {};
    try {
        const response = await fetch('/api/dcomfy/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageId }),
        });
        body = await response.json().catch(() => ({}));
        if (!response.ok) {
            notify(body.error || `Send to Dynamic Comfy failed (${response.status})`, 'error');
            if (response.status === 502) void refreshDcomfyStatus(true);
            return;
        }
    } catch (cause) {
        notify(cause instanceof Error ? cause.message : 'Send to Dynamic Comfy failed', 'error');
        return;
    }
    const what = body.mode === 'values' ? `Opened in Dynamic Comfy (${body.workflow})` : 'Sent to the Dynamic Comfy agent';
    if (body.clients) {
        notify(what);
        return;
    }
    const opened = window.open(dcomfyPageUrl(), '_blank');
    notify(opened ? what : `${what}; open Dynamic Comfy to see it`, opened ? undefined : 'warn');
}
