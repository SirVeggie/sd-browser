import { browser } from '$app/environment';
import { pullGlobalSettings } from '$lib/requests/settingRequests.js';
import { updateGlobalSettings } from '$lib/stores/globalSettings.js';
import { doGet } from '$lib/tools/requests.js';
import { isSettingResponse } from '$lib/types/requests.js';

export async function load({ fetch, parent }) {
    if (browser) {
        await parent();
        pullGlobalSettings(fetch);
    }
}