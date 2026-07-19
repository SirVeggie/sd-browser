import { get } from 'svelte/store';
import { page } from '$app/stores';
import { doGet, doPatch, doPost, doServerGet, doServerPatch, doServerPost, type FetchType } from '$lib/tools/requests';

export async function deleteTagFromImages(name: string, fetch?: FetchType): Promise<number> {
    let url = '/api/settings/tags';
    if (!fetch)
        url = get(page).url.origin + url;

    const res = await (fetch ? doPost(url, fetch, { name }) : doServerPost(url, { name }));
    if ('error' in res)
        throw new Error(res.error);

    return typeof res.removedFrom === 'number' ? res.removedFrom : 0;
}

export async function renameTagOnImages(
    oldName: string,
    newName: string,
    fetch?: FetchType,
): Promise<number> {
    let url = '/api/settings/tags';
    if (!fetch)
        url = get(page).url.origin + url;

    const res = await (fetch
        ? doPatch(url, fetch, { oldName, newName })
        : doServerPatch(url, { oldName, newName }));
    if ('error' in res)
        throw new Error(res.error);

    return typeof res.renamedFrom === 'number' ? res.renamedFrom : 0;
}

export async function fetchImageTags(imageId: string, fetch?: FetchType): Promise<string[]> {
    let url = `/api/images/${imageId}/tags`;
    if (!fetch)
        url = get(page).url.origin + url;

    const res = await (fetch ? doGet(url, fetch) : doServerGet(url));
    if ('error' in res)
        throw new Error(res.error);

    if (!Array.isArray(res.tags))
        throw new Error('Invalid tags response');

    return res.tags as string[];
}

export async function updateImageTags(imageId: string, tags: string[], fetch?: FetchType): Promise<string[]> {
    let url = `/api/images/${imageId}/tags`;
    if (!fetch)
        url = get(page).url.origin + url;

    const res = await (fetch ? doPost(url, fetch, { tags }) : doServerPost(url, { tags }));
    if ('error' in res)
        throw new Error(res.error);

    if (!Array.isArray(res.tags))
        throw new Error('Invalid tags response');

    return res.tags as string[];
}
