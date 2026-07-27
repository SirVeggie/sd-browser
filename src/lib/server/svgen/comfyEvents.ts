import WebSocket from 'ws';
import { env } from '$env/dynamic/private';
import { getComfyUrl } from '$lib/server/comfy';

export type ComfyBridgeMessage = {
    type: string;
    data: Record<string, unknown>;
};

type BridgeListener = (message: ComfyBridgeMessage) => void;

type Bridge = {
    ws: WebSocket;
    listeners: Set<BridgeListener>;
    clientId: string;
};

const bridges = new Map<string, Bridge>();

function comfyWsUrl(clientId: string): string {
    const base = getComfyUrl();
    const url = new URL(base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    url.search = `clientId=${encodeURIComponent(clientId)}`;
    return url.toString();
}

function authorizationHeader(token?: string): Record<string, string> {
    const trimmed = (env.COMFY_TOKEN || token)?.trim();
    if (!trimmed)
        return {};
    return { Authorization: `Bearer ${trimmed}` };
}

function getOrCreateBridge(clientId: string, token?: string): Bridge {
    const existing = bridges.get(clientId);
    if (existing && existing.ws.readyState <= WebSocket.OPEN)
        return existing;

    const ws = new WebSocket(comfyWsUrl(clientId), {
        headers: authorizationHeader(token),
    });
    const bridge: Bridge = {
        ws,
        listeners: new Set(),
        clientId,
    };
    bridges.set(clientId, bridge);

    ws.on('message', (raw, isBinary) => {
        if (isBinary)
            return;
        const text = typeof raw === 'string' ? raw : Buffer.from(raw as ArrayBuffer).toString('utf8');
        let msg: ComfyBridgeMessage;
        try {
            const parsed = JSON.parse(text) as { type?: string; data?: Record<string, unknown> };
            if (!parsed?.type)
                return;
            msg = { type: parsed.type, data: parsed.data ?? {} };
        } catch {
            return;
        }
        for (const listener of bridge.listeners)
            listener(msg);
    });

    const cleanup = () => {
        const current = bridges.get(clientId);
        if (current?.ws === ws)
            bridges.delete(clientId);
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);

    return bridge;
}

/** Subscribe to Comfy WS events via a server-side socket (no browser Origin). */
export function subscribeComfyBridge(
    clientId: string,
    listener: BridgeListener,
    token?: string,
): () => void {
    const bridge = getOrCreateBridge(clientId, token);
    bridge.listeners.add(listener);

    return () => {
        bridge.listeners.delete(listener);
        if (bridge.listeners.size === 0) {
            try {
                bridge.ws.close();
            } catch {
                /* ignore */
            }
            if (bridges.get(clientId) === bridge)
                bridges.delete(clientId);
        }
    };
}
