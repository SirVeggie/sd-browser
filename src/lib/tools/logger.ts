import { browser } from "$app/environment";

export function log(message: string) {
    if (browser) {
        console.log(message);
    }
}
