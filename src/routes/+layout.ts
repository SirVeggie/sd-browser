import { browser } from "$app/environment";
import { syncAuthWithLocalStorage } from "$lib/stores/authStore";
import { syncFlyoutWithLocalStorage } from "$lib/stores/flyoutStore";
import { syncFullscreenWithLocalStorage } from "$lib/stores/fullscreenStore";
import { syncSearchWithLocalStorage } from "$lib/stores/searchStore";
import { syncStyleWithLocalStorage } from "$lib/stores/styleStore";
import { subscribeAuth } from "$lib/tools/requests";

export async function load() {
    if (browser) {
        subscribeAuth();
        
        syncAuthWithLocalStorage();
        syncSearchWithLocalStorage();
        syncFlyoutWithLocalStorage();
        syncFullscreenWithLocalStorage();
        syncStyleWithLocalStorage();
    }
}