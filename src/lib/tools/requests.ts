export type FetchType = (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>;

export async function doGet(url: string, fetch: FetchType) {
    const response = await fetch(url, {
        headers: {
            ['Authorization']: 'Bearer 1234',
        }
    });
    const json = await response.json();
    return json;
}

export async function doServerGet(url: string) {
    const response = await fetch(url, {
        headers: {
            Authorization: 'Bearer 1234'
        }
    });
    const json = await response.json();
    return json;
}