import { browser } from "$app/environment";
import { syncAuthWithLocalStorage } from "$lib/stores/authStore";
import { syncFlyoutWithLocalStorage } from "$lib/stores/flyoutStore";
import { syncFullscreenWithLocalStorage } from "$lib/stores/fullscreenStore";
import { syncSearchWithLocalStorage } from "$lib/stores/searchStore";
import { syncCustomFiltersWithLocalStorage } from "$lib/stores/customFiltersStore";
import { syncStyleWithLocalStorage } from "$lib/stores/styleStore";
import { syncBulkModalWithLocalStorage } from "$lib/stores/bulkStore";
import { syncLlmWithLocalStorage } from "$lib/stores/llmStore";
import { migrateFolderFilterToCustomFilters } from "$lib/migrations/folderFilterMigration";
import { subscribeAuth } from "$lib/tools/requests";

export async function load() {
    if (browser) {
        subscribeAuth();
        
        migrateFolderFilterToCustomFilters();
        syncAuthWithLocalStorage();
        syncCustomFiltersWithLocalStorage();
        syncSearchWithLocalStorage();
        syncFlyoutWithLocalStorage();
        syncFullscreenWithLocalStorage();
        syncStyleWithLocalStorage();
        syncLlmWithLocalStorage();
        syncBulkModalWithLocalStorage();
    }
}