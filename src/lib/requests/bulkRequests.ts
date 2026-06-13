import { get } from "svelte/store";
import { page } from "$app/stores";
import { authStore } from "$lib/stores/authStore";
import type { SearchParams } from "$lib/stores/searchStore";
import { isMatchResponse, type BulkProgressEvent, type BulkRequest, type MatchResponse } from "$lib/types/requests";
import type { FetchType } from "../tools/requests";
import { doPost, doServerPost } from "../tools/requests";

export async function resolveSearchMatch(params: SearchParams, customFetch?: FetchType): Promise<MatchResponse> {
    let url = "/api/images/match";
    if (!customFetch) {
        url = get(page).url.origin + url;
    }

    const res = await (customFetch ? doPost(url, customFetch, params) : doServerPost(url, params));
    if (!isMatchResponse(res)) {
        if ("error" in res) {
            throw new Error(res.error);
        }
        throw new Error("Invalid match response");
    }
    return res;
}

export async function runBulkAction(
    request: BulkRequest,
    onProgress: (event: BulkProgressEvent) => void,
    customFetch?: FetchType,
    signal?: AbortSignal,
) {
    let url = "/api/images/bulk";
    if (!customFetch) {
        url = get(page).url.origin + url;
    }

    const doFetch = customFetch ?? globalThis.fetch.bind(globalThis);
    const response = await doFetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${get(authStore).password}`,
        },
        body: JSON.stringify(request),
        signal,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Bulk request failed (${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Bulk response has no body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as BulkProgressEvent;
            onProgress(event);
            if ("error" in event) {
                throw new Error(event.error);
            }
        }
    }

    if (buffer.trim()) {
        const event = JSON.parse(buffer) as BulkProgressEvent;
        onProgress(event);
        if ("error" in event) {
            throw new Error(event.error);
        }
    }
}
