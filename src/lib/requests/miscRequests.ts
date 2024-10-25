import { page } from "$app/stores";
import { doGet, doServerGet, type FetchType } from "$lib/tools/requests";
import { isFoldersResponse } from "$lib/types/requests";
import { get } from "svelte/store";

export async function fetchFolderStructure(fetch?: FetchType) {
    let url = `/api/folders`;
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doGet(url, fetch) : doServerGet(url));
    if (!isFoldersResponse(res))
        throw new Error('Invalid folder structure response');
    return res.folders;
}