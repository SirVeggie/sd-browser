/** Wire format for client→server custom IMG ref vectors: base64 of little-endian Float32. */
export type TempEmbeddingsMap = Record<string, string>;

const TEMP_ID_IN_SEARCH_REGEX = /temp:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function collectTempImageIdsFromSearch(search: string): Set<string> {
    const ids = new Set<string>();
    const regex = new RegExp(TEMP_ID_IN_SEARCH_REGEX.source, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(search)) !== null)
        ids.add(match[0].toLowerCase());
    return ids;
}

function bytesToBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(base64, "base64"));
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export function encodeFloat32Embedding(values: ArrayLike<number>): string {
    const floats = values instanceof Float32Array ? values : Float32Array.from(values as ArrayLike<number>);
    return bytesToBase64(new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength));
}

export function decodeFloat32Embedding(base64: string): Float32Array {
    const bytes = base64ToBytes(base64);
    if (bytes.byteLength < 4 || bytes.byteLength % 4 !== 0) {
        throw new Error("Invalid temp embedding payload");
    }
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

export function isTempEmbeddingsMap(value: unknown): value is TempEmbeddingsMap {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    for (const [id, encoded] of Object.entries(value)) {
        if (typeof id !== "string" || !/^temp:/i.test(id))
            return false;
        if (typeof encoded !== "string" || encoded.length < 8)
            return false;
    }
    return true;
}
