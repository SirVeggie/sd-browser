import { authStore } from "$lib/stores/authStore";

let auth = "";

export type FetchType = (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>;

export function subscribeAuth() {
    authStore?.subscribe(value => auth = value.password);
}

async function parseJsonResponse(response: Response) {
    const text = await response.text();
    if (!text.trim()) {
        return {
            error: response.ok
                ? 'Empty response from server'
                : `Request failed (${response.status})`,
        };
    }

    try {
        return JSON.parse(text);
    } catch {
        return {
            error: response.ok
                ? 'Invalid JSON response from server'
                : text,
        };
    }
}

export async function doGet(url: string, fetch: FetchType) {
    const response = await fetch(url, {
        headers: {
            Authorization: 'Bearer ' + auth,
        }
    });
    return await parseJsonResponse(response);
}

export async function doPost(url: string, fetch: FetchType, body: any) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + auth,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return await parseJsonResponse(response);
}

export async function doServerGet(url: string) {
    const response = await fetch(url, {
        headers: {
            Authorization: 'Bearer ' + auth,
        }
    });
    return await parseJsonResponse(response);
}

export async function doServerPost(url: string, body: any) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + auth,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return await parseJsonResponse(response);
}