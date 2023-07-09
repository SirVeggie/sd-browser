import type { Writable } from "svelte/store";

export function syncMemory<T>(name: string, store: Writable<T>) {
    if (localStorage.getItem(name)) {
        store.set(JSON.parse(localStorage.getItem(name) || ''));
    }
    store.subscribe(x => {
        localStorage.setItem('flyout', JSON.stringify(x));
    });
}