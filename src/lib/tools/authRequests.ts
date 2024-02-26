import { page } from "$app/stores";
import { get } from "svelte/store";
import { doGet, doServerGet } from "./requests";


export async function attemptLogin(): Promise<boolean> {
    let url = `/api/auth`;
    console.log("Attempting login");
    if (!fetch)
        url = get(page).url.origin + url;
    const res = await (fetch ? doGet(url, fetch) : doServerGet(url));
    
    if ('error' in res) {
        console.log(`Login failed with error: ${res.error}`);
        return false;
    }
    
    console.log("Login succeeded");
    return true;
}