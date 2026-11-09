import { env } from '$env/dynamic/private';
import { readFile } from 'fs/promises';
import path from 'path';

// Dynamic Comfy (S:\Library\Projects\dynamic-comfy): a second ComfyUI-based UI on its own port.
const DEFAULT_DCOMFY_URL = 'http://127.0.0.1:8190';
const STATUS_TTL_MS = 10_000;

export function getDcomfyUrl(): string {
    return (env.DCOMFY_URL ?? DEFAULT_DCOMFY_URL).replace(/\/$/, '');
}

/** Browser-facing base URL, when it differs from DCOMFY_URL's host (empty: the browser uses its own host). */
export function getDcomfyPublicUrl(): string {
    return (env.DCOMFY_PUBLIC_URL ?? '').trim().replace(/\/$/, '');
}

export type DcomfyStatus = { available: boolean; publicUrl: string; port: number };

let cached: { at: number; available: boolean } | undefined;

function dcomfyPort(): number {
    try {
        const url = new URL(getDcomfyUrl());
        return Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
    } catch {
        return 8190;
    }
}

/** Is Dynamic Comfy (not some other server) listening there? Cached briefly. */
export async function checkDcomfy(): Promise<DcomfyStatus> {
    const now = Date.now();
    if (!cached || now - cached.at > STATUS_TTL_MS) {
        let available = false;
        try {
            const response = await fetch(`${getDcomfyUrl()}/dc/api/ping`, { signal: AbortSignal.timeout(1500) });
            const body = response.ok ? await response.json().catch(() => null) : null;
            available = !!body && typeof body === 'object' && (body as { app?: unknown }).app === 'dynamic-comfy';
        } catch {
            available = false;
        }
        cached = { at: now, available };
    }
    return { available: cached.available, publicUrl: getDcomfyPublicUrl(), port: dcomfyPort() };
}

export type DcomfySendResult = {
    mode: 'values' | 'agent';
    workflow?: string;
    clients: number;
};

export class DcomfyRequestError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'DcomfyRequestError';
        this.status = status;
    }
}

/** Posts the image file; Dynamic Comfy reads its metadata (dcomfy params, or a graph for its agent). */
export async function sendImageToDcomfy(file: string): Promise<DcomfySendResult> {
    const data = await readFile(file);
    const name = path.basename(file);
    const form = new FormData();
    form.append('file', new Blob([data]), name);
    form.append('name', name);

    let response: Response;
    try {
        response = await fetch(`${getDcomfyUrl()}/dc/api/open`, { method: 'POST', body: form });
    } catch (cause) {
        cached = undefined;
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new DcomfyRequestError(`Dynamic Comfy is unreachable at ${getDcomfyUrl()}: ${detail}`, 502);
    }
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !body) {
        const message = typeof body?.error === 'string' ? body.error : `Dynamic Comfy rejected the image (${response.status})`;
        throw new DcomfyRequestError(message, response.status >= 400 && response.status < 500 ? response.status : 502);
    }
    return {
        mode: body.mode === 'values' ? 'values' : 'agent',
        workflow: typeof body.workflow === 'string' ? body.workflow : undefined,
        clients: typeof body.clients === 'number' ? body.clients : 0,
    };
}
