import { get } from 'svelte/store';
import { authStore } from '$lib/stores/authStore';
import { page } from '$app/stores';

const LOCAL_PREFIX = 'local:';
const COMFY_TOKEN_KEY = 'comfyWorkflowOpenToken';

function storedComfyToken(): string | undefined {
    try {
        return sessionStorage.getItem(COMFY_TOKEN_KEY)?.trim() || undefined;
    } catch {
        return undefined;
    }
}

export type ComfyFolderType = 'input' | 'output' | 'temp';

export function isLocalImageId(imageId: string): boolean {
    return String(imageId || '').startsWith(LOCAL_PREFIX);
}

export function stripLocalImageId(imageId: string): string {
    const text = String(imageId || '');
    return text.startsWith(LOCAL_PREFIX) ? text.slice(LOCAL_PREFIX.length) : text;
}

export function toLocalImageId(path: string): string {
    return `${LOCAL_PREFIX}${String(path || '').replace(/^\/+/, '')}`;
}

export function parseImageWidgetValue(
    rawValue: unknown,
    folderType: ComfyFolderType = 'input',
): { filename: string; subfolder: string; type: ComfyFolderType } | null {
    let text = String(rawValue ?? '').trim();
    if (!text)
        return null;

    let type: ComfyFolderType = folderType;
    const annotation = text.match(/\s*\[(input|output|temp)\]\s*$/i);
    if (annotation) {
        type = annotation[1].toLowerCase() as ComfyFolderType;
        text = text.slice(0, annotation.index).trim();
    }

    const normalized = text.replace(/\\/g, '/');
    if (!normalized)
        return null;

    const slash = normalized.lastIndexOf('/');
    const filename = slash >= 0 ? normalized.slice(slash + 1) : normalized;
    const subfolder = slash >= 0 ? normalized.slice(0, slash) : '';
    if (!filename)
        return null;

    return { filename, subfolder, type };
}

/** Relative URL for proxied Comfy `/view` from structured output refs (executed event images). */
export function buildComfyViewPathFromRef(
    image: { filename: string; subfolder?: string; type?: ComfyFolderType | string },
    opts: { cacheBust?: boolean } = {},
): string {
    const filename = String(image.filename || '').trim();
    if (!filename)
        return '';
    const typeRaw = String(image.type || 'temp').toLowerCase();
    const type: ComfyFolderType =
        typeRaw === 'input' || typeRaw === 'output' || typeRaw === 'temp' ? typeRaw : 'temp';
    const params = new URLSearchParams({
        filename,
        type,
        preview: 'webp;70',
    });
    const subfolder = String(image.subfolder || '').trim();
    if (subfolder)
        params.set('subfolder', subfolder);
    if (opts.cacheBust)
        params.set('rand', String(Date.now()));
    return `/api/svgen/comfy/view?${params.toString()}`;
}

/** Relative URL for proxied Comfy `/view` (needs Authorization fetch or img with cookie — use fetch→blob for auth). */
export function buildComfyViewPath(
    rawValue: unknown,
    opts: { cacheBust?: boolean; folderType?: ComfyFolderType } = {},
): string {
    const parsed = parseImageWidgetValue(rawValue, opts.folderType ?? 'input');
    if (!parsed)
        return '';
    return buildComfyViewPathFromRef(parsed, opts);
}

export function sdBrowserImageUrl(
    imageId: string,
    opts: { quality?: 'minimal' | 'low' | 'medium'; defer?: boolean; preview?: boolean } = {},
): string {
    const params = new URLSearchParams({
        quality: opts.quality ?? 'minimal',
    });
    if (opts.defer !== false)
        params.set('defer', 'true');
    if (opts.preview !== false)
        params.set('preview', 'true');
    return `/api/images/${encodeURIComponent(imageId)}?${params.toString()}`;
}

/** Stable preview cache so card remounts / layout churn do not refetch or flash. */
const BLOB_CACHE_LIMIT = 64;
const blobCache = new Map<string, string>();
const blobInflight = new Map<string, Promise<string | null>>();

function cacheKeyForPath(path: string): string {
    // Ignore cache-bust query so remounts hit the same entry.
    try {
        const url = new URL(path, 'http://local.invalid');
        url.searchParams.delete('rand');
        return url.pathname + url.search;
    } catch {
        return path.replace(/([?&])rand=\d+/g, '').replace(/[?&]$/, '');
    }
}

function touchBlobCache(key: string, blobUrl: string) {
    if (blobCache.has(key))
        blobCache.delete(key);
    blobCache.set(key, blobUrl);
    while (blobCache.size > BLOB_CACHE_LIMIT) {
        const oldest = blobCache.keys().next().value;
        if (oldest === undefined)
            break;
        const evicted = blobCache.get(oldest);
        blobCache.delete(oldest);
        if (evicted)
            URL.revokeObjectURL(evicted);
    }
}

/** Sync hit for mounting previews without a loading flash. */
export function peekAuthorizedBlobUrl(path: string): string | null {
    if (!path)
        return null;
    return blobCache.get(cacheKeyForPath(path)) ?? null;
}

export async function fetchAuthorizedBlobUrl(path: string): Promise<string | null> {
    if (!path)
        return null;
    const key = cacheKeyForPath(path);
    const cached = blobCache.get(key);
    if (cached) {
        touchBlobCache(key, cached);
        return cached;
    }

    const pending = blobInflight.get(key);
    if (pending)
        return pending;

    const request = (async () => {
        try {
            const headers: Record<string, string> = {
                Authorization: 'Bearer ' + get(authStore).password,
            };
            const comfyToken = storedComfyToken();
            if (comfyToken)
                headers['X-Comfy-Authorization'] = `Bearer ${comfyToken}`;
            const url = path.startsWith('http') ? path : get(page).url.origin + path;
            const response = await fetch(url, { headers });
            if (!response.ok)
                return null;
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            touchBlobCache(key, blobUrl);
            return blobUrl;
        } catch {
            return null;
        } finally {
            blobInflight.delete(key);
        }
    })();

    blobInflight.set(key, request);
    return request;
}

/** Drop one cached preview (e.g. after overwrite upload of the same path). */
export function invalidateAuthorizedBlobUrl(path: string) {
    if (!path)
        return;
    const key = cacheKeyForPath(path);
    const existing = blobCache.get(key);
    if (!existing)
        return;
    blobCache.delete(key);
    URL.revokeObjectURL(existing);
}

export async function uploadComfyImageFile(
    file: File,
    folderType: ComfyFolderType = 'input',
): Promise<string> {
    const body = new FormData();
    body.append('image', file);
    body.append('type', folderType);
    body.append('overwrite', 'true');

    const headers: Record<string, string> = {
        Authorization: 'Bearer ' + get(authStore).password,
    };
    const comfyToken = storedComfyToken();
    if (comfyToken)
        headers['X-Comfy-Authorization'] = `Bearer ${comfyToken}`;

    const response = await fetch(get(page).url.origin + '/api/svgen/comfy/upload', {
        method: 'POST',
        headers,
        body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data && typeof data === 'object' && 'error' in data
            ? String(data.error)
            : `Upload failed (${response.status})`;
        throw new Error(message);
    }
    const name = String(data.name || data.filename || file.name);
    const subfolder = String(data.subfolder || '');
    return subfolder ? `${subfolder}/${name}` : name;
}
