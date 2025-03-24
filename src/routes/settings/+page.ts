import { browser } from '$app/environment';
import { pullGlobalSettings } from '$lib/requests/settingRequests.js';

export async function load({ fetch, parent }) {
    if (browser) {
        await parent();
        pullGlobalSettings(fetch);
    }
}