import { browser } from "$app/environment";
import { syncFlyoutWithLocalStorage } from "$lib/stores/flyoutStore";
import { syncFullscreenWithLocalStorage } from "$lib/stores/fullscreenStore";
import { syncSearchWithLocalStorage } from "$lib/stores/searchStore";
import { syncStyleWithLocalStorage } from "$lib/stores/styleStore";

export function load() {
    if (browser) {
        syncSearchWithLocalStorage();
        syncFlyoutWithLocalStorage();
        syncFullscreenWithLocalStorage();
        syncStyleWithLocalStorage();
    }
}