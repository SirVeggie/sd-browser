import { browser } from "$app/environment";
import { syncAuthWithLocalStorage } from "$lib/stores/authStore";
import { syncFlyoutWithLocalStorage } from "$lib/stores/flyoutStore";
import { syncFullscreenWithLocalStorage } from "$lib/stores/fullscreenStore";
import { syncStealthInfoWithLocalStorage } from "$lib/stores/imageStore";
import { syncSearchWithLocalStorage } from "$lib/stores/searchStore";
import { syncStyleWithLocalStorage } from "$lib/stores/styleStore";

export function load() {
    if (browser) {
        syncAuthWithLocalStorage();
        syncSearchWithLocalStorage();
        syncFlyoutWithLocalStorage();
        syncFullscreenWithLocalStorage();
        syncStealthInfoWithLocalStorage();
        syncStyleWithLocalStorage();
    }
}