import { page } from "$app/stores";
import { doGet, doServerGet, type FetchType } from "$lib/tools/requests";
import { isFoldersResponse } from "$lib/types/requests";
import { get } from "svelte/store";

let cachedFolderPaths: string[] | undefined;
let folderPathsPromise: Promise<string[]> | undefined;

export function invalidateFolderPathsCache() {
    cachedFolderPaths = undefined;
    folderPathsPromise = undefined;
}

export async function fetchFolderPaths(fetch?: FetchType): Promise<string[]> {
    if (cachedFolderPaths) return cachedFolderPaths;
    if (!folderPathsPromise) {
        folderPathsPromise = loadFolderPaths(fetch).finally(() => {
            folderPathsPromise = undefined;
        });
    }
    return folderPathsPromise;
}

async function loadFolderPaths(fetch?: FetchType): Promise<string[]> {
    let url = `/api/folders`;
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doGet(url, fetch) : doServerGet(url));
    if (!isFoldersResponse(res))
        throw new Error('Invalid folder structure response');
    cachedFolderPaths = res.paths;
    return res.paths;
}
