import { browser } from '$app/environment';
import { notify } from '$lib/components/Notifier.svelte';
import { isLocalAuthValid } from '$lib/stores/authStore.js';
import { updateGlobalSettings } from '$lib/stores/globalSettings';
import { doGet } from '$lib/tools/requests';
import { sleep } from '$lib/tools/sleep.js';
import { isSettingResponse } from '$lib/types/requests';

export async function load({ fetch }) {
    if (browser && isLocalAuthValid()) {
        if (!await syncGlobal(fetch)) {
            await sleep(100);
            if (!await syncGlobal(fetch)) {
                notify('Failed to sync global settings', 'error');
            }
        }
    }
}

async function syncGlobal(fetch: any) {
    const obj = await doGet('/api/settings', fetch);

    if (!isSettingResponse(obj)) {
        console.log(obj);
        return false;
    }

    const settings = JSON.parse(obj.settingsJson) as Record<string, any>;
    updateGlobalSettings(settings);
    return true;
}