import { browser } from "$app/environment";
import { syncAuthWithLocalStorage } from "$lib/stores/authStore";
import { syncFlyoutWithLocalStorage } from "$lib/stores/flyoutStore";
import { syncFullscreenWithLocalStorage } from "$lib/stores/fullscreenStore";
import { updateGlobalSettings } from "$lib/stores/globalSettings";
import { syncSearchWithLocalStorage } from "$lib/stores/searchStore";
import { syncStyleWithLocalStorage } from "$lib/stores/styleStore";
import { doGet, subscribeAuth } from "$lib/tools/requests";
import { isSettingResponse } from "$lib/types/requests";

export async function load({ fetch }) {
    if (browser) {
        subscribeAuth();
        
        syncAuthWithLocalStorage();
        syncSearchWithLocalStorage();
        syncFlyoutWithLocalStorage();
        syncFullscreenWithLocalStorage();
        syncStyleWithLocalStorage();
        
        const obj = await doGet('/api/settings', fetch);
        if (!isSettingResponse(obj)) {
            console.log(obj);
            throw new Error('Invalid settings response');
        }
        const settings = JSON.parse(obj.settingsJson) as Record<string, any>;
        updateGlobalSettings(settings);
    }
}