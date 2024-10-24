import { authStore } from "$lib/stores/authStore";

let auth = "";

export type FetchType = (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>;

export function subscribeAuth() {
    authStore?.subscribe(value => auth = value.password);
}

export async function doGet(url: string, fetch: FetchType) {
    const response = await fetch(url, {
        headers: {
            Authorization: 'Bearer ' + auth,
        }
    });
    return await response.json();
}

export async function doPost(url: string, fetch: FetchType, body: any) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + auth,
        },
        body: JSON.stringify(body),
    });
    return await response.json();
}

export async function doServerGet(url: string) {
    const response = await fetch(url, {
        headers: {
            Authorization: 'Bearer ' + auth,
        }
    });
    return await response.json();
}

export async function doServerPost(url: string, body: any) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + auth,
        },
        body: JSON.stringify(body),
    });
    return await response.json();
}